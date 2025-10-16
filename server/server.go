package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/ccheshirecat/flint/pkg/imagerepository"
	"github.com/ccheshirecat/flint/pkg/libvirtclient"
	"github.com/ccheshirecat/flint/pkg/logger"
	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

type Server struct {
	router           *chi.Mux
	client           libvirtclient.ClientInterface
	assets           embed.FS
	apiKey           string
	passphraseHash   string
	rateLimiters     map[string]*rateLimiter
	rateLimiterMutex sync.RWMutex
	imageRepo        *imagerepository.ImageRepository
	sessions         map[string]time.Time // sessionID -> expiry time
	sessionsMu       sync.RWMutex
}

type rateLimiter struct {
	tokens     int
	lastRefill time.Time
}

func NewServer(client libvirtclient.ClientInterface, assets embed.FS) *Server {
	// Initialize image repository
	imageRepoPath := "/var/lib/flint/image-repository"
	imageRepo := imagerepository.NewImageRepository(imageRepoPath)

	s := &Server{
		router:       chi.NewRouter(),
		client:       client,
		assets:       assets,
		rateLimiters: make(map[string]*rateLimiter),
		imageRepo:    imageRepo,
		sessions:     make(map[string]time.Time),
	}

	// Load or generate config
	s.loadOrGenerateConfig()

	logger.Info("Initializing Flint server", map[string]interface{}{
		"api_key_length": len(s.apiKey),
	})

	// Start session cleanup goroutine
	go s.cleanupExpiredSessions()

	// s.router.Use(middleware.Logger) // Add logging middleware
	s.setupRoutes()
	return s
}

// loadOrGenerateConfig loads config from file or creates a new one with defaults
func (s *Server) loadOrGenerateConfig() {
	configDir := filepath.Join(os.Getenv("HOME"), ".flint")
	configPath := filepath.Join(configDir, "config.json")

	// Try to load existing config
	if data, err := os.ReadFile(configPath); err == nil {
		var config map[string]interface{}
		if err := json.Unmarshal(data, &config); err == nil {
			if apiKey, exists := config["api_key"]; exists && apiKey != "" {
				s.apiKey = apiKey.(string)
			}
			// Load passphrase hash if it exists
			if security, exists := config["security"].(map[string]interface{}); exists {
				if passphraseHash, exists := security["passphrase_hash"].(string); exists && passphraseHash != "" {
					s.passphraseHash = passphraseHash
				}
			}
			logger.Info("Loaded config from file")
			return
		}
	}

	// Generate new config with defaults
	s.apiKey = s.generateAPIKey()
	config := s.createDefaultConfig()

	// Save to config file
	if err := os.MkdirAll(configDir, 0755); err != nil {
		logger.Error("Failed to create config directory", map[string]interface{}{
			"error": err.Error(),
			"path":  configDir,
		})
		return
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		logger.Error("Failed to marshal config", map[string]interface{}{
			"error": err.Error(),
		})
		return
	}

	if err := os.WriteFile(configPath, data, 0600); err != nil {
		logger.Error("Failed to save config file", map[string]interface{}{
			"error": err.Error(),
			"path":  configPath,
		})
		return
	}

	logger.Info("Generated and saved new config file", map[string]interface{}{
		"config_path":  configPath,
		"bind_address": config["server"].(map[string]interface{})["host"],
	})
}

// generateAPIKey generates a secure API key
func (s *Server) generateAPIKey() string {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		logger.Error("Failed to generate secure API key", map[string]interface{}{
			"error": err.Error(),
		})
		// This is a critical security failure - exit rather than use weak key
		panic("Failed to generate cryptographically secure API key")
	}
	return hex.EncodeToString(bytes)
}

// createDefaultConfig creates a default configuration
func (s *Server) createDefaultConfig() map[string]interface{} {
	return map[string]interface{}{
		"api_key": s.apiKey,
		"server": map[string]interface{}{
			"host":          "0.0.0.0", // Bind to all interfaces for remote server access
			"port":          5550,
			"read_timeout":  30,
			"write_timeout": 30,
		},
		"security": map[string]interface{}{
			"rate_limit_requests": 100,
			"rate_limit_burst":    20,
			"passphrase_hash":     s.passphraseHash,
		},
		"libvirt": map[string]interface{}{
			"uri":             "qemu:///system",
			"iso_pool":        "isos",
			"template_pool":   "templates",
			"image_pool_path": "/var/lib/flint/images",
		},
		"logging": map[string]interface{}{
			"level":  "INFO",
			"format": "json",
		},
	}
}

// detectPublicIP tries to detect the public IPv4 address
func (s *Server) detectPublicIP() string {
	// Try multiple services to detect public IP
	services := []string{
		"https://api.ipify.org",
		"https://ipv4.icanhazip.com",
		"https://checkip.amazonaws.com",
	}

	for _, service := range services {
		if ip := s.fetchIPFromService(service); ip != "" {
			return ip
		}
	}

	// Fallback: try to get local IP
	return s.getLocalIP()
}

// fetchIPFromService fetches IP from a public IP service
func (s *Server) fetchIPFromService(url string) string {
	resp, err := http.Get(url)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(body))
}

// getLocalIP gets the local IP address
func (s *Server) getLocalIP() string {
	// Simple implementation - in real code we'd enumerate network interfaces
	return "127.0.0.1" // Secure fallback
}

// webAuthMiddleware validates web UI passphrase
func (s *Server) webAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth for API endpoints (they use API key)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		// Check for session cookie or prompt for passphrase
		cookie, err := r.Cookie("flint_session")
		if err == nil && s.isValidSession(cookie.Value) {
			// Valid session, continue
			next.ServeHTTP(w, r)
			return
		}

		// Check if this is a login POST request
		if r.Method == "POST" && r.URL.Path == "/login" {
			if err := r.ParseForm(); err != nil {
				http.Error(w, "Invalid form data", http.StatusBadRequest)
				return
			}

			passphrase := r.FormValue("passphrase")
			if s.validatePassphrase(passphrase) {
				// Create new session
				sessionID, err := s.createSession()
				if err != nil {
					http.Error(w, "Failed to create session", http.StatusInternalServerError)
					return
				}

				// Set secure session cookie
				http.SetCookie(w, &http.Cookie{
					Name:     "flint_session",
					Value:    sessionID,
					Path:     "/",
					HttpOnly: true,
					MaxAge:   24 * 60 * 60, // 24 hours
				})
				http.Redirect(w, r, "/", http.StatusSeeOther)
				return
			}

			// Invalid passphrase, show login form again
			s.showLoginForm(w, true)
			return
		}

		// Show login form
		s.showLoginForm(w, false)
	})
}

// showLoginForm displays the login form
func (s *Server) showLoginForm(w http.ResponseWriter, invalid bool) {
	w.Header().Set("Content-Type", "text/html")
	var errorMsg string
	if invalid {
		errorMsg = `<div style="color: red; margin-bottom: 10px;">Invalid passphrase</div>`
	}

	html := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
    <title>Flint - Login</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 50px; background: #f5f5f5; }
        .login { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
        input[type="password"] { width: 100%%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; }
        button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%%; }
        button:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div class="login">
        <h2>🔐 Flint Web UI</h2>
        %s
        <form method="POST" action="/login">
            <input type="password" name="passphrase" placeholder="Enter passphrase" required>
            <button type="submit">Login</button>
        </form>
    </div>
</body>
</html>`, errorMsg)

	w.Write([]byte(html))
}

// validatePassphrase checks if the provided passphrase matches the hash
func (s *Server) validatePassphrase(passphrase string) bool {
	if passphrase == "" {
		return false
	}

	storedHash := s.getStoredPassphraseHash()

	// Check if it's an old SHA256 hash (64 hex chars) and migrate to bcrypt
	if len(storedHash) == 64 {
		// Legacy SHA256 hash - compare directly for backward compatibility
		hash := sha256.Sum256([]byte(passphrase))
		providedHash := hex.EncodeToString(hash[:])
		return providedHash == storedHash
	}

	// Use bcrypt comparison for new hashes
	err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(passphrase))
	return err == nil
}

// getStoredPassphraseHash returns the stored passphrase hash
func (s *Server) getStoredPassphraseHash() string {
	return s.passphraseHash
}

// authMiddleware validates API key from Authorization header OR session cookie
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// First try API key authentication (for CLI/API usage)
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" {
			// Expected format: "Bearer <api-key>"
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" && subtle.ConstantTimeCompare([]byte(parts[1]), []byte(s.apiKey)) == 1 {
				// Valid API key, continue
				ctx := context.WithValue(r.Context(), "api_key", parts[1])
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		// Fallback to session cookie authentication (for web app)
		cookie, err := r.Cookie("flint_session")
		if err == nil && s.isValidSession(cookie.Value) {
			// Valid session from passphrase authentication
			next.ServeHTTP(w, r)
			return
		}

		// No valid authentication found
		http.Error(w, `{"error": "Authentication required. Use API key or login via web UI"}`, http.StatusUnauthorized)
	})
}

// rateLimitMiddleware implements rate limiting per client
func (s *Server) rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip rate limiting for health check
		if r.URL.Path == "/api/health" {
			next.ServeHTTP(w, r)
			return
		}

		// Use client IP as the rate limiting key
		clientIP := s.getClientIP(r)

		// Check rate limit
		if !s.allowRequest(clientIP) {
			w.Header().Set("Retry-After", "60")
			http.Error(w, `{"error": "Rate limit exceeded. Try again in 60 seconds."}`, http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// getClientIP extracts the real client IP from the request
func (s *Server) getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header first (for reverse proxies)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// X-Forwarded-For format: client, proxy1, proxy2
		// Take the leftmost (original client) IP
		ips := strings.Split(xff, ",")
		if len(ips) > 0 {
			clientIP := strings.TrimSpace(ips[0])
			// Validate it's a proper IP
			if clientIP != "" && !strings.Contains(clientIP, " ") {
				return clientIP
			}
		}
	}

	// Check X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}

	// Fall back to RemoteAddr
	if idx := strings.LastIndex(r.RemoteAddr, ":"); idx > 0 {
		return r.RemoteAddr[:idx]
	}
	return r.RemoteAddr
}

// allowRequest checks if a request should be allowed based on rate limiting
func (s *Server) allowRequest(clientIP string) bool {
	s.rateLimiterMutex.Lock()
	defer s.rateLimiterMutex.Unlock()

	now := time.Now()
	limiter, exists := s.rateLimiters[clientIP]

	if !exists {
		// New client - create limiter with 100 requests per minute
		s.rateLimiters[clientIP] = &rateLimiter{
			tokens:     99, // Allow immediate request
			lastRefill: now,
		}
		return true
	}

	// Refill tokens based on time passed
	timePassed := now.Sub(limiter.lastRefill)
	tokensToAdd := int(timePassed.Seconds() * 100 / 60) // 100 requests per minute

	if tokensToAdd > 0 {
		limiter.tokens = min(limiter.tokens+tokensToAdd, 100)
		limiter.lastRefill = now
	}

	if limiter.tokens > 0 {
		limiter.tokens--
		return true
	}

	return false
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// Serve embedded static files via chi, without overriding API routes
func (s *Server) setupRoutes() {
	// Public API endpoints (no authentication required)
	s.router.Get("/api/health", s.handleHealthCheck())

	// Serial console endpoints (token-based auth, not middleware auth)
	s.router.Get("/api/vms/{uuid}/serial-console", s.handleGetVMSerialConsole())
	s.router.Get("/api/vms/{uuid}/serial-console/ws", s.handleVMSerialConsoleWS())

	// Protected API routes with authentication
	s.router.Route("/api", func(r chi.Router) {
		r.Use(s.authMiddleware)
		r.Get("/api-key", s.handleGetAPIKey()) // Now requires authentication!
		r.Get("/ssh-key/detect", s.handleDetectSSHKey())
		r.Get("/vms", s.handleGetVMs())
		r.Post("/vms", s.handleCreateVM())
		r.Post("/vms/from-template", s.handleCreateVMFromTemplate())
		r.Get("/vms/{uuid}", s.handleGetVMDetails())
		r.Delete("/vms/{uuid}", s.handleDeleteVM())
		r.Post("/vms/{uuid}/action", s.handleVMAction())
		r.Get("/vms/{uuid}/guest-agent/status", s.handleGetGuestAgentStatus())
		r.Post("/vms/{uuid}/guest-agent/install", s.handleInstallGuestAgent())
		r.Get("/vms/{uuid}/console-stream", s.handleGetVMConsoleStream())
		r.Get("/vms/{uuid}/snapshots", s.handleGetVMSnapshots())
		r.Post("/vms/{uuid}/snapshots", s.handleCreateVMSnapshot())
		r.Delete("/vms/{uuid}/snapshots/{snapshotName}", s.handleDeleteVMSnapshot())
		r.Post("/vms/{uuid}/snapshots/{snapshotName}/revert", s.handleRevertToVMSnapshot())
		r.Get("/vm-templates", s.handleGetVMTemplates())
		r.Post("/vm-templates", s.handleCreateVMTemplate())
		r.Get("/vms/{uuid}/performance", s.handleGetVMPerformance())
		r.Post("/vms/{uuid}/attach-disk", s.handleAttachDiskToVM())
		r.Post("/vms/{uuid}/attach-network", s.handleAttachNetworkInterfaceToVM())
		r.Get("/host/status", s.handleGetHostStatus())
		r.Get("/host/resources", s.handleGetHostResources())
		r.Get("/storage-pools", s.handleGetStoragePools())
		r.Get("/storage-pools/{poolName}/volumes", s.handleGetVolumes())
		r.Post("/storage-pools/{poolName}/volumes", s.handleCreateVolume())
		r.Put("/storage-pools/{poolName}/volumes/{volumeName}", s.handleUpdateVolume())
		r.Get("/networks", s.handleGetNetworks())
		r.Get("/system-interfaces", s.handleGetSystemInterfaces())
		r.Post("/networks", s.handleCreateNetwork())
		r.Post("/bridges", s.handleCreateBridge())
		r.Put("/networks/{networkName}", s.handleUpdateNetwork())
		r.Delete("/networks/{networkName}", s.handleDeleteNetwork())
		r.Delete("/storage-pools/{poolName}/volumes/{volumeName}", s.handleDeleteVolume())
		r.Get("/images", s.handleGetImages())
		r.Post("/images/import-from-path", s.handleImportImageFromPath())
		r.Post("/images/download", s.handleDownloadImage())
		r.Delete("/images/{imageId}", s.handleDeleteImage())

		// Image repository endpoints
		r.Get("/image-repository", s.handleGetRepositoryImages())
		r.Post("/image-repository/{imageId}/download", s.handleDownloadRepositoryImage())
		r.Get("/image-repository/{imageId}/status", s.handleGetDownloadStatus())
		r.Get("/activity", s.handleGetActivity())
	})

	// Web UI routes with passphrase authentication
	// Create a sub-router for web UI with authentication middleware
	webRouter := chi.NewRouter()
	webRouter.Use(s.webAuthMiddleware)

	// Serve static files from embedded assets with middleware
	webRouter.Get("/*", func(w http.ResponseWriter, r *http.Request) {
		// Handle embedded assets from web/out/ and web/public/
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		// First try web/out/ for built files
		embeddedPath := "web/out/" + path
		file, err := s.assets.Open(embeddedPath)
		if err != nil {
			// If not found in web/out/, try web/public/ for static assets
			publicPath := "web/public/" + path
			file, err = s.assets.Open(publicPath)
			if err != nil {
				// If file not found, try index.html for SPA routing
				if path != "index.html" {
					indexFile, indexErr := s.assets.Open("web/out/index.html")
					if indexErr == nil {
						defer indexFile.Close()
						w.Header().Set("Content-Type", "text/html")
						io.Copy(w, indexFile)
						return
					}
				}
				http.NotFound(w, r)
				return
			}
		}
		defer file.Close()

		// Set content type based on file extension
		if strings.HasSuffix(path, ".css") {
			w.Header().Set("Content-Type", "text/css")
		} else if strings.HasSuffix(path, ".js") {
			w.Header().Set("Content-Type", "application/javascript")
		} else if strings.HasSuffix(path, ".svg") {
			w.Header().Set("Content-Type", "image/svg+xml")
		} else if strings.HasSuffix(path, ".png") {
			w.Header().Set("Content-Type", "image/png")
		} else if strings.HasSuffix(path, ".ico") {
			w.Header().Set("Content-Type", "image/x-icon")
		}

		io.Copy(w, file)
	})

	// Mount the web router to handle all non-API routes
	s.router.Mount("/", webRouter)
}

// Start starts the HTTP server with graceful shutdown
func (s *Server) Start(addr string) error {
	if addr == "" {
		addr = "0.0.0.0:5550"
	}

	logger.Info("Starting Flint server", map[string]interface{}{
		"address": addr,
	})

	// Create a server instance for graceful shutdown
	srv := &http.Server{
		Addr:    addr,
		Handler: s.router,
	}

	// Channel to listen for interrupt or terminate signals
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)

	// Start server in a goroutine
	go func() {
		logger.Info("Server is listening", map[string]interface{}{
			"address": addr,
		})

		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("Server failed to start", map[string]interface{}{
				"error": err.Error(),
			})
		}
	}()

	// Wait for interrupt signal
	<-done
	logger.Info("Server is shutting down gracefully")

	// Create a context with timeout for shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Attempt graceful shutdown
	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown", map[string]interface{}{
			"error": err.Error(),
		})
		return err
	}

	logger.Info("Server shutdown complete")
	return nil
}

// validateAuthToken validates an authentication token

func (s *Server) validateAuthToken(token string) bool {
	// Validate token format and check against server's API key

	if token == "" {
		return false
	}

	// Check if token matches the server's API key
	if token != s.apiKey {
		return false
	}

	// Additional validation: check if token is a valid hex string of expected length
	if len(token) != 64 { // 32 bytes = 64 hex characters
		return false
	}

	// Check if it's valid hex
	for _, r := range token {
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
			return false
		}
	}

	return true
}

// generateAuthToken generates a secure authentication token
func (s *Server) generateAuthToken() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// GetAPIKey returns the server's API key (for CLI usage)
func (s *Server) GetAPIKey() string {
	return s.apiKey
}

// generateSessionID creates a cryptographically secure session ID
func (s *Server) generateSessionID() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// isValidSession checks if a session ID is valid and not expired
func (s *Server) isValidSession(sessionID string) bool {
	s.sessionsMu.RLock()
	defer s.sessionsMu.RUnlock()

	expiry, exists := s.sessions[sessionID]
	if !exists {
		return false
	}

	// Check if session has expired
	if time.Now().After(expiry) {
		// Clean up expired session
		go s.cleanupExpiredSession(sessionID)
		return false
	}

	return true
}

// createSession creates a new session and returns the session ID
func (s *Server) createSession() (string, error) {
	sessionID, err := s.generateSessionID()
	if err != nil {
		return "", err
	}

	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()

	// Initialize sessions map if needed
	if s.sessions == nil {
		s.sessions = make(map[string]time.Time)
	}

	// Session expires in 24 hours
	expiry := time.Now().Add(24 * time.Hour)
	s.sessions[sessionID] = expiry

	return sessionID, nil
}

// cleanupExpiredSession removes an expired session
func (s *Server) cleanupExpiredSession(sessionID string) {
	s.sessionsMu.Lock()
	defer s.sessionsMu.Unlock()
	delete(s.sessions, sessionID)
}

// cleanupExpiredSessions periodically cleans up expired sessions
func (s *Server) cleanupExpiredSessions() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.sessionsMu.Lock()
			now := time.Now()
			for sessionID, expiry := range s.sessions {
				if now.After(expiry) {
					delete(s.sessions, sessionID)
				}
			}
			s.sessionsMu.Unlock()
		}
	}
}
