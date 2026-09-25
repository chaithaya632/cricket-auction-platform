"use client"

// =============================================================================
// ACC Auction Portal — Components: Admin Users & Roles Table with Tabs & Deletion
// =============================================================================

import { useState, useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AssignRoleDialog } from "./assign-role-dialog"
import { DeleteUserDialog } from "./delete-user-dialog"
import type { AdminUserListItem } from "@/lib/users/types"
import type { Franchise } from "@/lib/acc/types"
import {
  Search,
  Shield,
  User,
  Trophy,
  UserCheck,
  Clock,
  Trash2,
  Users,
  Building2,
  AlertCircle,
} from "lucide-react"

type UserCategoryTab = "players" | "franchises" | "admins" | "all"

export function UsersTable({
  initialUsers,
  franchises,
}: {
  initialUsers: AdminUserListItem[]
  franchises: Franchise[]
}) {
  const [activeTab, setActiveTab] = useState<UserCategoryTab>("players")
  const [search, setSearch] = useState("")
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null)
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<AdminUserListItem | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Counts by category
  const counts = useMemo(() => {
    let players = 0
    let franchiseUsers = 0
    let admins = 0

    for (const u of initialUsers) {
      if (u.role === "player" || (!u.role && u.intended_role === "player")) {
        players++
      } else if (u.role === "franchise" || (!u.role && u.intended_role === "franchise")) {
        franchiseUsers++
      } else if (u.role === "super_admin" || u.role === "operator") {
        admins++
      }
    }
    return { players, franchiseUsers, admins, all: initialUsers.length }
  }, [initialUsers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return initialUsers.filter((u) => {
      // 1. Tab category filter
      if (activeTab === "players") {
        const isPlayer = u.role === "player" || (!u.role && u.intended_role === "player")
        if (!isPlayer) return false
      } else if (activeTab === "franchises") {
        const isFranchise = u.role === "franchise" || (!u.role && u.intended_role === "franchise")
        if (!isFranchise) return false
      } else if (activeTab === "admins") {
        const isAdmin = u.role === "super_admin" || u.role === "operator"
        if (!isAdmin) return false
      }

      // 2. Search query filter
      if (q) {
        const matchesName = u.full_name.toLowerCase().includes(q)
        const matchesEmail = u.email.toLowerCase().includes(q)
        const matchesFranchise = u.franchise_name?.toLowerCase().includes(q) ?? false
        const matchesShortCode = u.franchise_short_code?.toLowerCase().includes(q) ?? false
        if (!matchesName && !matchesEmail && !matchesFranchise && !matchesShortCode) {
          return false
        }
      }

      return true
    })
  }, [initialUsers, activeTab, search])

  function handleEditRole(user: AdminUserListItem) {
    setSelectedUser(user)
    setRoleDialogOpen(true)
  }

  function handleDeleteUser(user: AdminUserListItem) {
    setUserToDelete(user)
    setDeleteDialogOpen(true)
  }

  function renderRoleBadge(u: AdminUserListItem) {
    if (!u.role) {
      if (u.intended_role === "franchise") {
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-500 border border-blue-500/20">
            <Trophy className="size-3" />
            Franchise Rep (Unassigned)
          </span>
        )
      }
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-500 border border-amber-500/20">
          <Clock className="size-3" />
          Pending Role
        </span>
      )
    }

    if (u.role === "player") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-500 border border-emerald-500/20">
          <User className="size-3" />
          Player
        </span>
      )
    }

    if (u.role === "franchise") {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-500 border border-blue-500/20 w-fit">
            <Trophy className="size-3" />
            Franchise Seat Active
          </span>
          <span className="text-[11px] font-medium text-foreground/90 pl-1">
            {u.franchise_name ? `${u.franchise_name} (${u.franchise_short_code})` : "⚠️ Unassigned Seat"}
          </span>
        </div>
      )
    }

    if (u.role === "super_admin" || u.role === "operator") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-500 border border-purple-500/20">
          <Shield className="size-3" />
          {u.role === "super_admin" ? "Super Admin" : "Operator"}
        </span>
      )
    }

    return (
      <Badge variant="outline" className="text-xs">
        {u.role}
      </Badge>
    )
  }

  return (
    <div className="space-y-4">
      {/* Category Tab Selector */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("players")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === "players"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <User className="size-4" />
          <span>PLAYERS</span>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400 font-mono">
            {counts.players}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("franchises")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === "franchises"
              ? "border-blue-600 text-blue-600 dark:text-blue-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="size-4" />
          <span>FRANCHISE USERS</span>
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400 font-mono">
            {counts.franchiseUsers}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("admins")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === "admins"
              ? "border-purple-600 text-purple-600 dark:text-purple-400"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Shield className="size-4" />
          <span>ADMINS & OPERATORS</span>
          <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-xs text-purple-600 dark:text-purple-400 font-mono">
            {counts.admins}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === "all"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="size-4" />
          <span>ALL USERS</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono">
            {counts.all}
          </span>
        </button>
      </div>

      {/* Info notice for Franchise Users tab */}
      {activeTab === "franchises" && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground">
          <Building2 className="size-4 text-blue-500 shrink-0" />
          <div>
            <strong className="text-foreground">Franchise Multi-User Seat Assignment:</strong> Multiple users (co-owners, scouts, managers, representatives) can be assigned to each of the 11 official franchises. Seat capacity per franchise is not restricted.
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or franchise…"
            className="pl-9 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User Account</TableHead>
              <TableHead>Tournament Assignment</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">Registered Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                  No accounts found in this section.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-semibold text-sm leading-tight text-foreground">
                        {u.full_name}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {u.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{renderRoleBadge(u)}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground font-mono">
                    {u.phone || "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditRole(u)}
                        className="text-xs gap-1.5 cursor-pointer"
                      >
                        <UserCheck className="size-3.5 text-primary" />
                        <span>
                          {u.role === "franchise" || (!u.role && u.intended_role === "franchise")
                            ? u.franchise_id ? "Change Team" : "Assign Franchise"
                            : u.role ? "Edit Role" : "Assign Role"}
                        </span>
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteUser(u)}
                        title="Permanently delete user"
                        className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer px-2"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Role & Franchise Assignment Modal */}
      <AssignRoleDialog
        key={selectedUser?.id ?? "none"}
        user={selectedUser}
        franchises={franchises}
        open={roleDialogOpen}
        onOpenChange={(open) => {
          setRoleDialogOpen(open)
          if (!open) setSelectedUser(null)
        }}
      />

      {/* Delete User Modal */}
      <DeleteUserDialog
        key={`delete-${userToDelete?.id ?? "none"}`}
        user={userToDelete}
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) setUserToDelete(null)
        }}
      />
    </div>
  )
}
