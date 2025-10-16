"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "@/components/i18n-provider"

// Import Xterm.js conditionally to avoid SSR issues
let Terminal: any = null
let FitAddon: any = null

if (typeof window !== 'undefined') {
  // Only import on client side
  const xterm = require("@xterm/xterm")
  const fitAddon = require("@xterm/addon-fit")
  Terminal = xterm.Terminal
  FitAddon = fitAddon.FitAddon

  // Import CSS
  require("@xterm/xterm/css/xterm.css")
}

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Terminal as TerminalIcon, AlertCircle } from "lucide-react"

interface VMSerialConsoleProps {
  vmUuid: string
}

export function VMSerialConsole({ vmUuid }: VMSerialConsoleProps) {
  const { t } = useTranslation()
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstanceRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const socketRef = useRef<WebSocket | null>(null)

  const [isConnecting, setIsConnecting] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!terminalRef.current || !vmUuid || !Terminal || !FitAddon) return

    const initializeTerminal = async () => {
      try {
        setIsConnecting(true)
        setError(null)

        // Initialize Xterm.js
        const term = new Terminal({
          cursorBlink: true,
          cursorStyle: "block",
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: {
            background: "#000000",
            foreground: "#ffffff",
            cursor: "#ffffff",
            cursorAccent: "#000000",
          },
          allowTransparency: false,
          scrollback: 1000,
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)

        // Open terminal in the DOM
        term.open(terminalRef.current!)
        fitAddon.fit()

        // Store references
        terminalInstanceRef.current = term
        fitAddonRef.current = fitAddon

        // Write initial message
        term.write(`🔌 ${t('vm.connectingToConsole')}...\r\n`)

        // Connect to WebSocket
        await connectToSerialConsole(vmUuid, term)

      } catch (err) {
        console.error("Failed to initialize terminal:", err)
        setError(err instanceof Error ? err.message : "Failed to initialize terminal")
        setIsConnecting(false)
      }
    }

    initializeTerminal()

    // Cleanup function
    return () => {
      if (socketRef.current) {
        socketRef.current.close()
      }
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose()
      }
    }
  }, [vmUuid])

  const connectToSerialConsole = async (vmUuid: string, term: any) => {
    try {
      // Step 1: Get connection details from HTTP endpoint
      const response = await fetch(`/api/vms/${vmUuid}/serial-console`, {
        credentials: 'include'
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to get console details: ${response.status} - ${errorText}`)
      }

      const responseData = await response.json()
      const { websocket_path, token } = responseData

      if (!token) {
        throw new Error("No authentication token received from server")
      }

      // Step 2: Build WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}${websocket_path}?token=${token}`

      // Step 3: Open WebSocket connection
      const socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onopen = () => {
        console.log("Serial console WebSocket connected")
        term.write(`✅ ${t('vm.connectedToConsole')}\r\n`)
        term.write(`${t('vm.consoleHelp')}\r\n\r\n`)
        setIsConnected(true)
        setIsConnecting(false)
      }

      socket.onmessage = (event) => {
        // Write data from server to terminal
        term.write(event.data)
      }

      socket.onclose = (event) => {
        console.log("Serial console WebSocket closed", event.code, event.reason)
        term.write(`\r\n🚫 ${t('vm.disconnectedFromConsole')}\r\n`)
        if (event.code !== 1000) {
          term.write(`${t('vm.disconnectReason')}: ${event.reason || t('vm.connectionFailed')} (${t('vm.code')}: ${event.code})\r\n`)
          if (event.code === 1006) {
            term.write(`${t('vm.connectionIssueHint')}\r\n`)
          }
        }
        setIsConnected(false)
        setIsConnecting(false)
      }

      socket.onerror = (error) => {
        console.error("Serial console WebSocket error:", error)
        term.write(`\r\n❌ ${t('vm.connectionError')}\r\n`)
        setError(t('vm.websocketFailed'))
        setIsConnecting(false)
      }

      // Step 4: Wire up terminal input to WebSocket
      term.onData((data: any) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(data)
        }
      })

    } catch (err) {
      console.error("Failed to connect to serial console:", err)
      const errorMessage = err instanceof Error ? err.message : t('vm.failedToConnect')
      term.write(`\r\n❌ ${errorMessage}\r\n`)
      setError(errorMessage)
      setIsConnecting(false)
    }
  }

  const handleReconnect = () => {
    if (terminalInstanceRef.current && vmUuid) {
      setIsConnecting(true)
      setError(null)
      connectToSerialConsole(vmUuid, terminalInstanceRef.current)
    }
  }

  const handleResize = () => {
    if (fitAddonRef.current) {
      fitAddonRef.current.fit()
    }
  }

  // Handle window resize
  useEffect(() => {
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <TerminalIcon className="h-5 w-5" />
          {t('vm.serialConsole')}
          {isConnected && (
            <div className="ml-auto flex items-center gap-2">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-muted-foreground">{t('vm.connected')}</span>
            </div>
          )}
          {isConnecting && (
            <div className="ml-auto flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">{t('vm.connecting')}...</span>
            </div>
          )}
          {!isConnected && !isConnecting && (
            <div className="ml-auto flex items-center gap-2">
              <div className="h-2 w-2 bg-red-500 rounded-full" />
              <span className="text-sm text-muted-foreground">{t('vm.disconnected')}</span>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative">
          {error && (
            <div className="absolute top-4 left-4 right-4 z-10">
              <div className="bg-destructive/90 text-destructive-foreground p-3 rounded-md flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReconnect}
                  className="ml-auto"
                >
                  {t('vm.reconnect')}
                </Button>
              </div>
            </div>
          )}

          <div
            ref={terminalRef}
            className="w-full h-96 bg-black rounded-b-lg"
            style={{ minHeight: '400px' }}
          />

          {!isConnected && !isConnecting && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-b-lg">
              <div className="text-center text-white">
                <TerminalIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">{t('vm.consoleDisconnected')}</p>
                <p className="text-sm opacity-75 mb-4">{t('vm.clickReconnect')}</p>
                <Button onClick={handleReconnect} variant="outline">
                  {t('vm.reconnect')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}