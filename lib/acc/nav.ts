import {
  LayoutDashboard,
  Users,
  Shield,
  Gavel,
  ListChecks,
  UserRound,
  Trophy,
  Search,
  ClipboardList,
  Settings,
  type LucideIcon,
} from "lucide-react"

export type Role = "admin" | "franchise" | "player"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export const ROLE_NAV: Record<Role, NavSection[]> = {
  admin: [
    {
      label: "Overview",
      items: [{ title: "Dashboard", href: "/admin", icon: LayoutDashboard }],
    },
    {
      label: "Auction",
      items: [
        { title: "Live Console", href: "/admin/auction", icon: Gavel },
        { title: "Lot Queue", href: "/admin/queue", icon: ListChecks },
      ],
    },
    {
      label: "Registry",
      items: [
        { title: "Players", href: "/admin/players", icon: Users },
        { title: "Franchises", href: "/admin/franchises", icon: Shield },
      ],
    },
    {
      label: "System",
      items: [{ title: "Settings", href: "/admin/settings", icon: Settings }],
    },
  ],
  franchise: [
    {
      label: "Team",
      items: [
        { title: "Dashboard", href: "/franchise", icon: LayoutDashboard },
        { title: "My Squad", href: "/franchise/squad", icon: Trophy },
      ],
    },
    {
      label: "Auction",
      items: [
        { title: "Live Auction", href: "/franchise/auction", icon: Gavel },
        { title: "Player Discovery", href: "/franchise/players", icon: Search },
      ],
    },
  ],
  player: [
    {
      label: "My Portal",
      items: [
        { title: "Dashboard", href: "/player", icon: LayoutDashboard },
        { title: "My Profile", href: "/player/profile", icon: UserRound },
        { title: "Registration", href: "/player/registration", icon: ClipboardList },
      ],
    },
  ],
}

export const ROLE_META: Record<Role, { label: string; homeHref: string }> = {
  admin: { label: "Admin Control", homeHref: "/admin" },
  franchise: { label: "Franchise Portal", homeHref: "/franchise" },
  player: { label: "Player Portal", homeHref: "/player" },
}
