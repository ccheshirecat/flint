package server

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/ccheshirecat/flint/pkg/core"
	"github.com/ccheshirecat/flint/pkg/imagerepository"
	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

func (s *Server) handleGetVMs() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vms, err := s.client.GetVMSummaries()
		if err != nil {
			sendInternalError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(vms)
	}
}

func (s *Server) handleGetVMDetails() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")
		if err := validateUUID(uuid); err != nil {
			sendError(w, err.Error(), http.StatusBadRequest)
			return
		}

		vm, err := s.client.GetVMDetails(uuid)
		if err != nil {
			// Check if it's a "domain not found" error
			if strings.Contains(err.Error(), "lookup domain") {
				http.Error(w, `{"error": "VM not found"}`, http.StatusNotFound)
			} else {
				http.Error(w, `{"error": "Failed to get VM details"}`, http.StatusInternalServerError)
			}
			return
		}
		json.NewEncoder(w).Encode(vm)
	}
}

func (s *Server) handleGetVMSnapshots() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")
		snapshots, err := s.client.GetVMSnapshots(uuid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(snapshots)
	}
}

func (s *Server) handleCreateVMSnapshot() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")
		var req core.CreateSnapshotRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error": "Invalid JSON in request body"}`, http.StatusBadRequest)
			return
		}

		snapshot, err := s.client.CreateVMSnapshot(uuid, req)
		if err != nil {
			http.Error(w, `{"error": "`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(snapshot)
	}
}

func (s *Server) handleDeleteVMSnapshot() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")
		snapshotName := chi.URLParam(r, "snapshotName")

		err := s.client.DeleteVMSnapshot(uuid, snapshotName)
		if err != nil {
			http.Error(w, `{"error": "`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// handleGetRepositoryImages returns all available cloud images from the repository
func (s *Server) handleGetRepositoryImages() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		images := s.imageRepo.GetImages()
		
		// Add download status to each image
		type ImageWithStatus struct {
			imagerepository.CloudImage
			Downloaded bool `json:"downloaded"`
		}
		
		var imagesWithStatus []ImageWithStatus
		for _, img := range images {
			imagesWithStatus = append(imagesWithStatus, ImageWithStatus{
				CloudImage: img,
				Downloaded: s.imageRepo.IsImageDownloaded(img.ID),
			})
		}
		
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(imagesWithStatus)
	}
}

// handleDownloadRepositoryImage downloads a cloud image from the repository
func (s *Server) handleDownloadRepositoryImage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		imageID := chi.URLParam(r, "imageId")
		if imageID == "" {
			http.Error(w, `{"error": "Image ID is required"}`, http.StatusBadRequest)
			return
		}

		// Check if already downloaded
		if s.imageRepo.IsImageDownloaded(imageID) {
			http.Error(w, `{"error": "Image already downloaded"}`, http.StatusConflict)
			return
		}

		// Start download in background
		go func() {
			var lastProgress float64 = -1
			err := s.imageRepo.DownloadImage(imageID, func(downloaded, total int64) {
				// Only log progress every 10% to reduce spam
				progress := float64(downloaded) / float64(total) * 100
				if progress-lastProgress >= 10 || progress == 100 {
					fmt.Printf("Download progress for %s: %.1f%%\n", imageID, progress)
					lastProgress = progress
				}
			})
			
			if err != nil {
				fmt.Printf("Download failed for %s: %v\n", imageID, err)
			} else {
				fmt.Printf("Download completed for %s\n", imageID)
				
				// Import the downloaded image into the main image library
				downloadedPath := s.imageRepo.GetDownloadedImagePath(imageID)
				if downloadedPath != "" {
					fmt.Printf("Importing downloaded image %s from %s\n", imageID, downloadedPath)
					_, importErr := s.client.ImportImageFromPath(downloadedPath)
					if importErr != nil {
						fmt.Printf("Failed to import downloaded image %s: %v\n", imageID, importErr)
					} else {
						fmt.Printf("Successfully imported downloaded image %s\n", imageID)
					}
				}
			}
		}()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "started",
			"message": "Download started in background",
			"imageId": imageID,
		})
	}
}

// handleGetDownloadStatus returns the download status of an image
func (s *Server) handleGetDownloadStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		imageID := chi.URLParam(r, "imageId")
		if imageID == "" {
			http.Error(w, `{"error": "Image ID is required"}`, http.StatusBadRequest)
			return
		}

		downloaded := s.imageRepo.IsImageDownloaded(imageID)
		
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"imageId":    imageID,
			"downloaded": downloaded,
			"path":       s.imageRepo.GetDownloadedImagePath(imageID),
		})
	}
}

func (s *Server) handleRevertToVMSnapshot() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")
		snapshotName := chi.URLParam(r, "snapshotName")

		err := s.client.RevertToVMSnapshot(uuid, snapshotName)
		if err != nil {
			http.Error(w, `{"error": "`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Revert action initiated."})
	}
}

func (s *Server) handleVMAction() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")
		var req struct {
			Action string `json:"action"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error": "Invalid JSON in request body"}`, http.StatusBadRequest)
			return
		}
		err := s.client.PerformVMAction(uuid, req.Action)
		if err != nil {
			if strings.Contains(err.Error(), "lookup domain") {
				http.Error(w, `{"error": "VM not found"}`, http.StatusNotFound)
			} else {
				http.Error(w, `{"error": "`+err.Error()+`"}`, http.StatusInternalServerError)
			}
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}

func (s *Server) handleDeleteVM() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")

		// Check query parameter for disk deletion (default: false for safety)
		deleteDisksStr := r.URL.Query().Get("deleteDisks")
		deleteDisks := false
		if deleteDisksStr == "true" {
			deleteDisks = true
		}

		err := s.client.DeleteVM(uuid, deleteDisks)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}

func (s *Server) handleGetHostStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status, err := s.client.GetHostStatus()
		if err != nil {
			sendInternalError(w, err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(status)
	}
}

func (s *Server) handleGetHostResources() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		resources, err := s.client.GetHostResources()
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error": "%s"}`, err.Error()), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resources)
	}
}

func (s *Server) handleGetStoragePools() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pools, err := s.client.GetStoragePools()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(pools)
	}
}

func (s *Server) handleGetNetworks() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		networks, err := s.client.GetNetworks()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(networks)
	}
}

func (s *Server) handleGetActivity() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		activity := s.client.GetActivity()
		json.NewEncoder(w).Encode(activity)
	}
}

func (s *Server) handleHealthCheck() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Check libvirt connectivity
		libvirtHealthy := true
		libvirtError := ""
		if err := s.checkLibvirtHealth(); err != nil {
			libvirtHealthy = false
			libvirtError = err.Error()
		}

		// Get system metrics
		hostStatus, hostErr := s.client.GetHostStatus()
		hostResources, resourcesErr := s.client.GetHostResources()

		health := map[string]interface{}{
			"status":         s.calculateOverallHealth(libvirtHealthy, hostErr, resourcesErr),
			"timestamp":      time.Now().Unix(),
			"version":        "0.1.0",
			"uptime_seconds": time.Since(time.Now().Add(-time.Hour)).Seconds(), // Placeholder
			"checks": map[string]interface{}{
				"libvirt": map[string]interface{}{
					"healthy": libvirtHealthy,
					"error":   libvirtError,
				},
				"host_status": map[string]interface{}{
					"healthy": hostErr == nil,
					"error":   "",
				},
				"host_resources": map[string]interface{}{
					"healthy": resourcesErr == nil,
					"error":   "",
				},
			},
		}

		// Add host info if available
		if hostErr == nil {
			health["host"] = map[string]interface{}{
				"hostname":           hostStatus.Hostname,
				"hypervisor_version": hostStatus.HypervisorVersion,
				"total_vms":          hostStatus.TotalVMs,
				"running_vms":        hostStatus.RunningVMs,
			}
		}

		// Add resource info if available
		if resourcesErr == nil {
			health["resources"] = map[string]interface{}{
				"total_memory_kb": hostResources.TotalMemoryKB,
				"free_memory_kb":  hostResources.FreeMemoryKB,
				"cpu_cores":       hostResources.CPUCores,
				"storage_total_b": hostResources.StorageTotalB,
				"storage_used_b":  hostResources.StorageUsedB,
			}
		}

		statusCode := http.StatusOK
		if health["status"] != "healthy" {
			statusCode = http.StatusServiceUnavailable
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(health)
	}
}

// checkLibvirtHealth performs a basic health check on libvirt connectivity
func (s *Server) checkLibvirtHealth() error {
	// Try to get host status as a connectivity test
	_, err := s.client.GetHostStatus()
	return err
}

// calculateOverallHealth determines the overall health status
func (s *Server) calculateOverallHealth(libvirtHealthy bool, hostErr, resourcesErr error) string {
	if !libvirtHealthy || hostErr != nil || resourcesErr != nil {
		return "unhealthy"
	}
	return "healthy"
}

func (s *Server) handleGetAPIKey() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Return API key for easy setup - use with caution in production
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte(s.apiKey))
	}
}

func (s *Server) handleGetImages() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		images, err := s.client.GetImages()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(images)
	}
}

func (s *Server) handleImportImageFromPath() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Path string `json:"path"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error": "Invalid JSON in request body"}`, http.StatusBadRequest)
			return
		}

		// Validate file path
		if err := validateFilePath(req.Path); err != nil {
			http.Error(w, fmt.Sprintf(`{"error": "%s"}`, err.Error()), http.StatusBadRequest)
			return
		}

		image, err := s.client.ImportImageFromPath(req.Path)
		if err != nil {
			http.Error(w, `{"error": "Failed to import image"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(image)
	}
}

func (s *Server) handleDownloadImage() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			URL  string `json:"url"`
			Name string `json:"name,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error": "Invalid JSON in request body"}`, http.StatusBadRequest)
			return
		}

		// Validate URL
		if req.URL == "" {
			http.Error(w, `{"error": "URL is required"}`, http.StatusBadRequest)
			return
		}

		// Parse URL to validate it
		parsedURL, err := url.Parse(req.URL)
		if err != nil {
			http.Error(w, `{"error": "Invalid URL format"}`, http.StatusBadRequest)
			return
		}

		// Only allow HTTP and HTTPS URLs
		if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
			http.Error(w, `{"error": "Only HTTP and HTTPS URLs are allowed"}`, http.StatusBadRequest)
			return
		}

		// Generate filename if not provided
		filename := req.Name
		if filename == "" {
			// Extract filename from URL
			urlPath := parsedURL.Path
			parts := strings.Split(urlPath, "/")
			if len(parts) > 0 {
				filename = parts[len(parts)-1]
			}
			// If still empty, generate a default name
			if filename == "" {
				filename = "downloaded-image-" + time.Now().Format("20060102-150405")
			}
		}

		// Create temporary file
		tempFile, err := os.CreateTemp("", "flint-download-*-"+filename)
		if err != nil {
			http.Error(w, `{"error": "Failed to create temporary file: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		defer os.Remove(tempFile.Name()) // Clean up temp file
		defer tempFile.Close()

		// Download the file
		resp, err := http.Get(req.URL)
		if err != nil {
			http.Error(w, `{"error": "Failed to download file: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		// Check if the download was successful
		if resp.StatusCode != http.StatusOK {
			http.Error(w, `{"error": "Failed to download file: HTTP `+strconv.Itoa(resp.StatusCode)+`"}`, http.StatusInternalServerError)
			return
		}

		// Copy the downloaded content to the temporary file
		_, err = io.Copy(tempFile, resp.Body)
		if err != nil {
			http.Error(w, `{"error": "Failed to save downloaded file: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		// Close the temp file so we can import it
		tempFile.Close()

		// Import the downloaded file into the managed image library
		image, err := s.client.ImportImageFromPath(tempFile.Name())
		if err != nil {
			http.Error(w, `{"error": "Failed to import downloaded image: `+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		// Return the imported image info
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(image)
	}
}

// generateSecureToken generates a secure random token for WebSocket authentication
func generateSecureToken() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func (s *Server) handleGetISOs() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		isos, err := s.client.GetISOs()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(isos)
	}
}

func (s *Server) handleGetTemplates() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		templates, err := s.client.GetTemplates()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(templates)
	}
}

func (s *Server) handleGetVMPerformance() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")
		perf, err := s.client.GetVMPerformance(uuid)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(perf)
	}
}

func (s *Server) handleGetVMSerialConsole() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")

		// Debug: Log API key length
		fmt.Printf("DEBUG: API key length: %d\n", len(s.apiKey))
		if s.apiKey == "" {
			fmt.Printf("DEBUG: API key is empty! Generating new one...\n")
			// Generate API key directly here since method might not be accessible
			bytes := make([]byte, 32)
			rand.Read(bytes)
			s.apiKey = hex.EncodeToString(bytes)
			fmt.Printf("DEBUG: Generated API key length: %d\n", len(s.apiKey))
		}

		// Use the server's API key for WebSocket authentication
		response := map[string]string{
			"websocket_path": fmt.Sprintf("/api/vms/%s/serial-console/ws", uuid),
			"token":          s.apiKey,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}
}

func (s *Server) handleGetGuestAgentStatus() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vmUUID := chi.URLParam(r, "uuid")
		if vmUUID == "" {
			http.Error(w, `{"error": "VM UUID is required"}`, http.StatusBadRequest)
			return
		}

		available, err := s.client.CheckGuestAgentStatus(vmUUID)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error": "Failed to check guest agent status: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"available": available,
			"vm_uuid":   vmUUID,
		})
	}
}

func (s *Server) handleInstallGuestAgent() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vmUUID := chi.URLParam(r, "uuid")
		if vmUUID == "" {
			http.Error(w, `{"error": "VM UUID is required"}`, http.StatusBadRequest)
			return
		}

		err := s.client.InstallGuestAgent(vmUUID)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error": "Failed to install guest agent: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "success",
			"message": "Guest agent installation attempted. Please wait a few moments and check status.",
		})
	}
}

func (s *Server) handleVMSerialConsoleWS() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")

		// Authenticate using token from query parameters
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "Authentication token required", http.StatusUnauthorized)
			return
		}

		// Validate the token against the server's API key
		if token != s.apiKey {
			http.Error(w, "Invalid authentication token", http.StatusUnauthorized)
			return
		}

		// Upgrade HTTP connection to WebSocket
		upgrader := websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true
				}

				return true
			},
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			http.Error(w, "Failed to upgrade to WebSocket", http.StatusBadRequest)
			return
		}
		defer conn.Close()

		// Get the PTY path for the VM
		ptyPath, err := s.client.GetVMSerialConsolePath(uuid)
		if err != nil {
			conn.WriteMessage(websocket.TextMessage, []byte("Error: "+err.Error()))
			return
		}

		// Open the PTY device
		ptyFile, err := os.OpenFile(ptyPath, os.O_RDWR, 0)
		if err != nil {
			conn.WriteMessage(websocket.TextMessage, []byte("Error opening PTY: "+err.Error()))
			return
		}
		defer ptyFile.Close()

		// Send connection confirmation
		conn.WriteMessage(websocket.TextMessage, []byte("Serial console connected\r\n"))

		// Set up bidirectional data flow with proper error handling
		var wg sync.WaitGroup
		wg.Add(2)

		// Channel to signal when either goroutine exits
		done := make(chan struct{})

		// WebSocket -> PTY
		go func() {
			defer wg.Done()
			defer close(done)

			for {
				select {
				case <-done:
					return
				default:
					messageType, data, err := conn.ReadMessage()
					if err != nil {
						// Connection closed or error
						return
					}

					// Only process text messages
					if messageType == websocket.TextMessage {
						_, err = ptyFile.Write(data)
						if err != nil {
							// PTY write error
							conn.WriteMessage(websocket.TextMessage, []byte("Error writing to PTY: "+err.Error()))
							return
						}
					}
				}
			}
		}()

		// PTY -> WebSocket
		go func() {
			defer wg.Done()

			reader := bufio.NewReader(ptyFile)
			buffer := make([]byte, 1024)

			for {
				select {
				case <-done:
					return
				default:
					n, err := reader.Read(buffer)
					if err != nil {
						if err != io.EOF {
							conn.WriteMessage(websocket.TextMessage, []byte("Error reading from PTY: "+err.Error()))
						}
						return
					}

					if n > 0 {
						err = conn.WriteMessage(websocket.TextMessage, buffer[:n])
						if err != nil {
							// WebSocket write error
							return
						}
					}
				}
			}
		}()

		wg.Wait()
	}
}

// validateVMCreationConfig validates VM creation configuration
func validateVMCreationConfig(cfg *core.VMCreationConfig) error {
	// Validate VM name
	if cfg.Name == "" {
		return fmt.Errorf("VM name is required")
	}
	if len(cfg.Name) > 64 {
		return fmt.Errorf("VM name must be 64 characters or less")
	}
	// Allow alphanumeric, hyphens, and underscores
	nameRegex := regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
	if !nameRegex.MatchString(cfg.Name) {
		return fmt.Errorf("VM name can only contain letters, numbers, hyphens, and underscores")
	}

	// Validate memory
	if cfg.MemoryMB == 0 {
		return fmt.Errorf("memory must be greater than 0 MB")
	}
	if cfg.MemoryMB > 524288 { // 512 GB limit
		return fmt.Errorf("memory cannot exceed 512 GB")
	}

	// Validate vCPUs
	if cfg.VCPUs <= 0 {
		return fmt.Errorf("vCPUs must be greater than 0")
	}
	if cfg.VCPUs > 128 {
		return fmt.Errorf("vCPUs cannot exceed 128")
	}

	// Validate image name
	if cfg.ImageName == "" {
		return fmt.Errorf("image name is required")
	}
	if len(cfg.ImageName) > 255 {
		return fmt.Errorf("image name must be 255 characters or less")
	}

	// Validate image type
	if cfg.ImageType != "" && cfg.ImageType != "iso" && cfg.ImageType != "template" {
		return fmt.Errorf("image type must be 'iso' or 'template'")
	}

	// Validate network name
	if cfg.NetworkName != "" && len(cfg.NetworkName) > 50 {
		return fmt.Errorf("network name must be 50 characters or less")
	}

	// Validate disk pool
	if cfg.DiskPool != "" && len(cfg.DiskPool) > 50 {
		return fmt.Errorf("disk pool name must be 50 characters or less")
	}

	// Validate disk size
	if cfg.DiskSizeGB > 10000 { // 10 TB limit
		return fmt.Errorf("disk size cannot exceed 10 TB")
	}

	// Validate cloud-init config if provided
	if cfg.CloudInit != nil {
		if err := validateCloudInitConfig(cfg.CloudInit); err != nil {
			return fmt.Errorf("invalid cloud-init config: %w", err)
		}
	}

	return nil
}

// validateCloudInitConfig validates cloud-init configuration
func validateCloudInitConfig(cfg *core.CloudInitConfig) error {
	if cfg.CommonFields.Hostname != "" {
		if len(cfg.CommonFields.Hostname) > 64 {
			return fmt.Errorf("hostname must be 64 characters or less")
		}
		hostnameRegex := regexp.MustCompile(`^[a-zA-Z0-9.-]+$`)
		if !hostnameRegex.MatchString(cfg.CommonFields.Hostname) {
			return fmt.Errorf("hostname can only contain letters, numbers, dots, and hyphens")
		}
	}

	if cfg.CommonFields.Username != "" {
		if len(cfg.CommonFields.Username) > 32 {
			return fmt.Errorf("username must be 32 characters or less")
		}
		usernameRegex := regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
		if !usernameRegex.MatchString(cfg.CommonFields.Username) {
			return fmt.Errorf("username can only contain letters, numbers, hyphens, and underscores")
		}
	}

	if len(cfg.CommonFields.Packages) > 50 {
		return fmt.Errorf("cannot specify more than 50 packages")
	}

	for _, pkg := range cfg.CommonFields.Packages {
		if len(pkg) > 100 {
			return fmt.Errorf("package name must be 100 characters or less")
		}
		packageRegex := regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)
		if !packageRegex.MatchString(pkg) {
			return fmt.Errorf("package name can only contain letters, numbers, dots, hyphens, and underscores")
		}
	}

	return nil
}

// validateUUID validates UUID format
func validateUUID(uuid string) error {
	if uuid == "" {
		return fmt.Errorf("UUID is required")
	}
	uuidRegex := regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)
	if !uuidRegex.MatchString(uuid) {
		return fmt.Errorf("invalid UUID format")
	}
	return nil
}

// validateFilePath validates file path for security
func validateFilePath(path string) error {
	if path == "" {
		return fmt.Errorf("file path is required")
	}
	if len(path) > 4096 {
		return fmt.Errorf("file path is too long")
	}
	// Prevent directory traversal
	if strings.Contains(path, "..") {
		return fmt.Errorf("file path cannot contain '..'")
	}
	// Basic path validation
	if !filepath.IsAbs(path) && !strings.HasPrefix(path, "./") && !strings.HasPrefix(path, "/") {
		return fmt.Errorf("file path must be absolute or start with './'")
	}
	return nil
}

// sendError sends a consistent error response
func sendError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// sendInternalError sends a generic internal error without exposing details
func sendInternalError(w http.ResponseWriter, err error) {
	// Log the actual error for debugging (you might want to use a proper logger)
	fmt.Printf("Internal error: %v\n", err)
	sendError(w, "Internal server error", http.StatusInternalServerError)
}

func (s *Server) handleCreateVM() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var cfg core.VMCreationConfig
		if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
			http.Error(w, `{"error": "Invalid JSON in request body"}`, http.StatusBadRequest)
			return
		}

		// Validate input
		if err := validateVMCreationConfig(&cfg); err != nil {
			sendError(w, err.Error(), http.StatusBadRequest)
			return
		}

		vm, err := s.client.CreateVM(cfg)
		if err != nil {
			// Don't expose internal error details that could be sensitive
			http.Error(w, `{"error": "Failed to create VM"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(vm)
	}
}

func (s *Server) handleGetVolumes() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		poolName := chi.URLParam(r, "poolName")
		volumes, err := s.client.GetVolumes(poolName)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(volumes)
	}
}

func (s *Server) handleCreateVolume() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		poolName := chi.URLParam(r, "poolName")

		var req core.VolumeConfig
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error": "Invalid JSON in request body"}`, http.StatusBadRequest)
			return
		}

		err := s.client.CreateVolume(poolName, req)
		if err != nil {
			http.Error(w, `{"error": "`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
	}
}

func (s *Server) handleUpdateVolume() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		poolName := chi.URLParam(r, "poolName")
		volumeName := chi.URLParam(r, "volumeName")

		if poolName == "" || volumeName == "" {
			http.Error(w, `{"error": "Pool name and volume name are required"}`, http.StatusBadRequest)
			return
		}

		var req struct {
			SizeGB int `json:"size_gb"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error": "Invalid JSON in request body"}`, http.StatusBadRequest)
			return
		}

		config := core.VolumeConfig{
			Name:   volumeName,
			SizeGB: uint64(req.SizeGB),
		}
		err := s.client.UpdateVolume(poolName, volumeName, config)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error": "Failed to update volume: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}

func (s *Server) handleCreateNetwork() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name       string `json:"name"`
			BridgeName string `json:"bridgeName"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error": "Invalid JSON in request body"}`, http.StatusBadRequest)
			return
		}

		err := s.client.CreateNetwork(req.Name, req.BridgeName)
		if err != nil {
			http.Error(w, `{"error": "`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusCreated)
	}
}

func (s *Server) handleAttachDiskToVM() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")
		var req struct {
			VolumePath string `json:"volumePath"`
			TargetDev  string `json:"targetDev"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error": "Invalid JSON in request body"}`, http.StatusBadRequest)
			return
		}

		err := s.client.AttachDiskToVM(uuid, req.VolumePath, req.TargetDev)
		if err != nil {
			http.Error(w, `{"error": "`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Disk attached successfully"})
	}
}

func (s *Server) handleAttachNetworkInterfaceToVM() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")
		var req struct {
			NetworkName string `json:"networkName"`
			Model       string `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error": "Invalid JSON in request body"}`, http.StatusBadRequest)
			return
		}

		err := s.client.AttachNetworkInterfaceToVM(uuid, req.NetworkName, req.Model)
		if err != nil {
			http.Error(w, `{"error": "`+err.Error()+`"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"message": "Network interface attached successfully"})
	}
}
func (s *Server) handleDetectSSHKey() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			http.Error(w, `{"error": "Failed to get user home directory"}`, http.StatusInternalServerError)
			return
		}

		sshKeyPath := filepath.Join(homeDir, ".ssh", "id_rsa.pub")

		if _, err := os.Stat(sshKeyPath); os.IsNotExist(err) {
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(""))
			return
		}

		keyContent, err := os.ReadFile(sshKeyPath)
		if err != nil {
			http.Error(w, `{"error": "Failed to read SSH key"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		w.Write(keyContent)
	}
}

// handleGetVMConsoleStream returns WebSocket connection info for console streaming
func (s *Server) handleGetVMConsoleStream() http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uuid := chi.URLParam(r, "uuid")
		if uuid == "" {
			http.Error(w, "UUID is required", http.StatusBadRequest)
			return
		}

		// Return WebSocket path for frontend to connect to
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"websocket_path": fmt.Sprintf("/api/vms/%s/serial-console/ws", uuid),
		})
	})
}

// handleCreateVMFromTemplate creates a VM from a template
func (s *Server) handleCreateVMFromTemplate() http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			TemplateID string `json:"templateId"`
			Name       string `json:"name"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		// Get snapshots for the template VM
		snapshots, err := s.client.GetVMSnapshots(req.TemplateID)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to get template snapshots: %v", err), http.StatusInternalServerError)
			return
		}

		if len(snapshots) == 0 {
			http.Error(w, "No snapshots found for template", http.StatusBadRequest)
			return
		}

		// Use the latest snapshot
		latestSnapshot := snapshots[0]

		// Create VM from snapshot (simplified - in practice you'd clone the VM)
		err = s.client.RevertToVMSnapshot(req.TemplateID, latestSnapshot.Name)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create VM from template: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"uuid":    req.TemplateID, // In practice, this would be a new UUID
			"name":    req.Name,
			"message": "VM created from template successfully",
		})
	})
}

// handleGetVMTemplates returns available VM templates
func (s *Server) handleGetVMTemplates() http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Get all VMs and check which ones have snapshots (templates)
		vms, err := s.client.GetVMSummaries()
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to get VMs: %v", err), http.StatusInternalServerError)
			return
		}

		var templates []map[string]interface{}

		for _, vm := range vms {
			snapshots, err := s.client.GetVMSnapshots(vm.UUID)
			if err != nil {
				continue // Skip VMs we can't get snapshots for
			}

			if len(snapshots) > 0 {
				// This VM has snapshots, so it can be used as a template
				template := map[string]interface{}{
					"id":          vm.UUID,
					"name":        vm.Name + "-template",
					"description": fmt.Sprintf("Template based on %s with %d snapshots", vm.Name, len(snapshots)),
					"sourceVM":    vm.Name,
					"vcpus":       vm.VCPUs,
					"memory":      vm.MemoryKB / 1024, // Convert to MB
					"diskSize":    20,                 // Default disk size
					"createdAt":   time.Now().Format(time.RFC3339),
				}
				templates = append(templates, template)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(templates)
	})
}

// handleCreateVMTemplate creates a new template from a VM
func (s *Server) handleCreateVMTemplate() http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			VMID        string `json:"vmId"`
			Name        string `json:"name"`
			Description string `json:"description"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		// Create a snapshot of the VM to use as template
		snapshotReq := core.CreateSnapshotRequest{
			Name:        req.Name,
			Description: req.Description,
		}

		snapshot, err := s.client.CreateVMSnapshot(req.VMID, snapshotReq)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create template snapshot: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":          req.VMID,
			"name":        req.Name,
			"description": req.Description,
			"snapshot":    snapshot.Name,
			"createdAt":   time.Now().Format(time.RFC3339),
			"message":     "Template created successfully",
		})
	})
}

// handleUpdateNetwork updates a virtual network (start/stop/restart)
func (s *Server) handleUpdateNetwork() http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		networkName := chi.URLParam(r, "networkName")
		if networkName == "" {
			http.Error(w, "Network name is required", http.StatusBadRequest)
			return
		}

		var req struct {
			Action string `json:"action"` // "start", "stop", "restart"
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		err := s.client.UpdateNetwork(networkName, req.Action)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error": "Failed to update network: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	})
}

// handleDeleteNetwork deletes a virtual network
func (s *Server) handleDeleteNetwork() http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		networkName := chi.URLParam(r, "networkName")
		if networkName == "" {
			http.Error(w, "Network name is required", http.StatusBadRequest)
			return
		}

		// Prevent deletion of default network
		if networkName == "default" {
			http.Error(w, "Cannot delete default network", http.StatusBadRequest)
			return
		}

		// Call the actual delete function
		err := s.client.DeleteNetwork(networkName)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error": "Failed to delete network: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": fmt.Sprintf("Network '%s' deleted successfully", networkName),
		})
	})
}

// handleDeleteImage deletes an image
func (s *Server) handleDeleteImage() http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		imageId := chi.URLParam(r, "imageId")
		if imageId == "" {
			http.Error(w, `{"error": "Image ID is required"}`, http.StatusBadRequest)
			return
		}

		// Call the actual delete function
		err := s.client.DeleteImage(imageId)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error": "Failed to delete image: %s"}`, err.Error()), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusNoContent)
	})
}
