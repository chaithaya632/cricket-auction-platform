"use client"

// =============================================================================
// ACC Auction Portal — Components: Admin Users & Roles Table
// =============================================================================

import { useState } from "react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AssignRoleDialog } from "./assign-role-dialog"
import type { AdminUserListItem } from "@/lib/users/types"
import type { Franchise } from "@/lib/acc/types"
import { Search, Shield, User, Trophy, UserCheck, Clock } from "lucide-react"

export function UsersTable({
  initialUsers,
  franchises,
}: {
  initialUsers: AdminUserListItem[]
  franchises: Franchise[]
}) {
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const filtered = initialUsers.filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.franchise_name && u.franchise_name.toLowerCase().includes(search.toLowerCase()))

    if (!matchesSearch) return false

    if (roleFilter === "all") return true
    if (roleFilter === "unassigned") return !u.role
    return u.role === roleFilter
  })

  function handleEditRole(user: AdminUserListItem) {
    setSelectedUser(user)
    setDialogOpen(true)
  }

  function renderRoleBadge(u: AdminUserListItem) {
    if (!u.role) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-500 border border-amber-500/20">
          <Clock className="size-3" />
          Pending Access
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
            Franchise Rep
          </span>
          <span className="text-[11px] font-medium text-foreground/80 pl-1">
            {u.franchise_name ? `${u.franchise_name} (${u.franchise_short_code})` : "Unassigned Team"}
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
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email..."
            className="pl-9 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={roleFilter} onValueChange={(val) => val && setRoleFilter(val)}>
            <SelectTrigger className="w-full sm:w-44 text-xs">
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users ({initialUsers.length})</SelectItem>
              <SelectItem value="unassigned">Pending Access</SelectItem>
              <SelectItem value="player">Players</SelectItem>
              <SelectItem value="franchise">Franchise Reps</SelectItem>
              <SelectItem value="operator">Operators</SelectItem>
              <SelectItem value="super_admin">Super Admins</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Tournament Role</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">Registered</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                  No users match the search/filter criteria.
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEditRole(u)}
                      className="text-xs gap-1.5"
                    >
                      <UserCheck className="size-3.5 text-primary" />
                      <span>{u.role ? "Edit Role" : "Assign Role"}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Role Assignment Modal */}
      <AssignRoleDialog
        key={selectedUser?.id ?? "none"}
        user={selectedUser}
        franchises={franchises}
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setSelectedUser(null)
        }}
      />
    </div>
  )
}
