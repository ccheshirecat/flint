"use client"

import type React from "react"
import Link from "next/link"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { useTranslation } from '@/components/i18n-provider'
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageToggle } from "@/components/language-toggle"
import { LayoutDashboard, Server, HardDrive, Network, ImageIcon, Settings, Menu, X, Activity } from "lucide-react"
import { vmAPI, hostAPI, HostResources, HostStatus } from "@/lib/api" // Assume HostStatus is imported here

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { t } = useTranslation()
  
  const navigation = [
    { name: t('navigation.dashboard'), href: "/", icon: LayoutDashboard },
    { name: t('navigation.virtualMachines'), href: "/vms", icon: Server },
    { name: t('navigation.storage'), href: "/storage", icon: HardDrive },
    { name: t('navigation.networking'), href: "/networking", icon: Network },
    { name: t('navigation.images'), href: "/images", icon: ImageIcon },
    { name: t('navigation.settings'), href: "/settings", icon: Settings },
  ]
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [vmCount, setVmCount] = useState<number | null>(null)
  const [hostStatus, setHostStatus] = useState<HostStatus | null>(null)
  const [hostResources, setHostResources] = useState<HostResources | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [vmsRes, resourcesRes, statusRes] = await Promise.all([
          vmAPI.getAll(),
          hostAPI.getResources(),
          hostAPI.getStatus(),
        ])
        setVmCount(vmsRes.length)
        setHostResources(resourcesRes)
        setHostStatus(statusRes)
      } catch (err) {
        console.error("Failed to fetch data:", err)
        setVmCount(0)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    
    // Refresh data every 30 seconds for real-time feel
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const formatMemory = (kb: number) => {
    const gb = kb / 1024 / 1024
    return gb.toFixed(1)
  }

  const formatStorage = (bytes: number) => {
    const gb = bytes / 1024 / 1024 / 1024
    return gb.toFixed(0)
  }

  return (
    <div className="h-screen overflow-hidden bg-background transition-colors duration-150">
      {/* Premium Header: Sticky, subtle blur, indigo accents */}
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 shadow-sm transition-all duration-200">
        <div className="flex h-14 sm:h-16 items-center justify-between px-3 sm:px-4 md:px-6">
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Mobile Menu Button with smooth hover */}
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden hover:bg-accent/50 transition-transform duration-150 hover:scale-105 focus-premium"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            {/* Logo Section: Chic, with subtle animation */}
            <Link href="/" className="flex items-center gap-2 sm:gap-3 animate-slide-up-fade hover:opacity-80 transition-opacity duration-200">
              <img src="/flint.svg" alt="Flint" className="h-12 w-12 animate-pulse-subtle" />
              <div className="hidden xs:block">
                <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-foreground">Flint</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">Premium Virtualization</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Status Indicator: Polished with badge and icon */}
            <div className="hidden sm:flex items-center gap-2 animate-fade-scale">
              <Activity className="h-4 w-4 text-primary transition-colors" />
              <span className="text-sm font-medium hidden md:inline">
                {loading ? t('common.loading') : vmCount !== null ? t('common.connected') : t('common.disconnected')}
              </span>
              {!loading && vmCount !== null && (
                <Badge 
                  variant="secondary" 
                  className="bg-accent/80 text-accent-foreground text-xs shadow-sm hover:shadow-md transition-shadow duration-150"
                >
                  {vmCount} VM{vmCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Enhanced Sidebar: Smooth slide, premium colors, subtle hovers */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-border/50 bg-sidebar transition-all duration-300 ease-out lg:static lg:translate-x-0 shadow-lg lg:shadow-none",
            sidebarOpen ? "translate-x-0 animate-slide-in" : "-translate-x-full",
          )}
        >
          <div className="flex h-full flex-col overflow-hidden">
            {/* Mobile Header Close Button */}
            <div className="flex h-14 sm:h-16 items-center justify-between px-4 lg:hidden border-b border-border/50 bg-sidebar/90">
              <span className="text-base sm:text-lg font-display font-bold text-sidebar-foreground">{t('navigation.dashboard')}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(false)}
                className="hover:bg-sidebar-accent/50 transition-colors duration-150 focus-premium"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>

            {/* Navigation Menu: Animated items, active states with shadows */}
            <nav className="flex-1 space-y-1 p-4 overflow-y-auto scrollbar-premium">
              {navigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-out hover-premium",
                      "text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
                      isActive 
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm animate-fade-scale" 
                        : "animate-slide-up-fade",
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className={cn(
                      "h-4 w-4 flex-shrink-0 transition-transform duration-150 group-hover:scale-110",
                      isActive ? "text-sidebar-primary-foreground" : "text-sidebar-foreground"
                    )} />
                    <span className="truncate font-medium">{item.name}</span>
                  </Link>
                )
              })}
            </nav>

            {/* System Status Card: Layered surfaces, subtle shadows, responsive */}
            <div className="border-t border-border/50 p-4 bg-surface-1">
              <div className="rounded-xl bg-surface-2 p-4 transition-all duration-200 hover:shadow-md hover:bg-surface-3 border border-border/30 animate-fade-in">
                <h3 className="text-sm font-display font-semibold text-foreground mb-3">{t('common.systemOverview')}</h3>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex justify-between items-center py-1">
                    <span>{t('common.cpuUsage')}</span>
                    <span className="font-medium text-foreground">
                      {loading ? "..." : hostResources ? `${Math.round((hostResources.total_memory_kb - hostResources.free_memory_kb) / hostResources.total_memory_kb * 100)}%` : "0%"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span>{t('common.memory')}</span>
                    <span className="font-medium text-foreground">
                      {loading ? "..." : hostResources ? `${formatMemory(hostResources.total_memory_kb - hostResources.free_memory_kb)}/${formatMemory(hostResources.total_memory_kb)} GB` : "0/0 GB"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span>{t('common.storage')}</span>
                    <span className="font-medium text-foreground">
                      {loading ? "..." : hostResources ? `${formatStorage(hostResources.storage_used_b)}/${formatStorage(hostResources.storage_total_b)} GB` : "0/0 GB"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span>{t('common.vmsRunning')}</span>
                    <span className="font-medium text-foreground">
                      {loading ? "..." : hostStatus ? `${hostStatus.running_vms}/${hostStatus.total_vms}` : "0/0"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile Overlay: Smooth fade for intuitive close */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity duration-300 ease-out"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content: Full height, smooth scroll, premium padding */}
        <main className="flex-1 overflow-hidden transition-all duration-150">
          <div className="h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] overflow-auto scrollbar-premium bg-surface-1">
            <div className="pt-4 sm:pt-6 lg:pt-8 px-4 sm:px-6 lg:px-8 pb-2">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
