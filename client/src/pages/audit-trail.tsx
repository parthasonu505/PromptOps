import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, hasRole, getAuthHeaders } from "@/lib/auth";
import { 
  FileText, User, Edit, Trash2, Plus, CheckCircle, 
  XCircle, AlertCircle, Shield, Clock, Search
} from "lucide-react";

interface AuditLog {
  id: number;
  userId: number;
  action: string;
  resourceType: string;
  resourceId: number;
  details?: Record<string, any>;
  createdAt: string;
  user?: {
    firstName: string;
    lastName: string;
    username: string;
    role: string;
  };
}

export default function AuditTrail() {
  const { user } = useAuth();
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Check if user has audit trail permissions
  const canViewAudit = hasRole(user, ["admin", "engineering_lead"]);

  const { data: auditLogs = [], isLoading } = useQuery({
    queryKey: ["/api/audit-logs", resourceTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (resourceTypeFilter) params.append("resourceType", resourceTypeFilter);
      
      const response = await fetch(`/api/audit-logs?${params}`, {
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch audit logs");
      }
      
      return response.json();
    },
    enabled: canViewAudit,
  });

  const getActionIcon = (action: string) => {
    const icons = {
      created: Plus,
      updated: Edit,
      deleted: Trash2,
      approved: CheckCircle,
      rejected: XCircle,
      requested_approval: Clock,
    };

    const Icon = icons[action as keyof typeof icons] || FileText;
    return <Icon className="h-4 w-4" />;
  };

  const getActionBadge = (action: string) => {
    const variants = {
      created: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      updated: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      deleted: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      requested_approval: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    };

    return (
      <Badge className={variants[action as keyof typeof variants] || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"}>
        {getActionIcon(action)}
        <span className="ml-1">{action.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
      </Badge>
    );
  };

  const getResourceTypeBadge = (resourceType: string) => {
    const variants = {
      prompt: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      prompt_version: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      user: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      approval: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      api_key: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    };

    return (
      <Badge className={variants[resourceType as keyof typeof variants] || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"}>
        {resourceType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </Badge>
    );
  };

  const filteredLogs = auditLogs.filter((log: AuditLog) => {
    const matchesAction = !actionFilter || actionFilter === "all" || log.action === actionFilter;
    const matchesSearch = !searchQuery || 
      log.user?.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user?.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user?.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.resourceType.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesAction && matchesSearch;
  });

  if (!canViewAudit) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Access Denied</h3>
              <p className="text-muted-foreground">
                You don't have permission to view the audit trail. Contact your administrator for access.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <Skeleton className="h-8 w-64" />
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const actionStats = {
    created: auditLogs.filter((log: AuditLog) => log.action === "created").length,
    updated: auditLogs.filter((log: AuditLog) => log.action === "updated").length,
    deleted: auditLogs.filter((log: AuditLog) => log.action === "deleted").length,
    approved: auditLogs.filter((log: AuditLog) => log.action === "approved").length,
  };

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground flex items-center">
            <Shield className="mr-2 h-6 w-6" />
            Audit Trail
          </h1>
          <p className="text-muted-foreground mt-2">
            Complete activity logs for compliance and traceability across the platform.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Plus className="h-8 w-8 text-green-500" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Created</p>
                  <p className="text-2xl font-semibold text-foreground">{actionStats.created}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Edit className="h-8 w-8 text-blue-500" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Updated</p>
                  <p className="text-2xl font-semibold text-foreground">{actionStats.updated}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Trash2 className="h-8 w-8 text-red-500" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Deleted</p>
                  <p className="text-2xl font-semibold text-foreground">{actionStats.deleted}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Approved</p>
                  <p className="text-2xl font-semibold text-foreground">{actionStats.approved}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search activities..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={resourceTypeFilter} onValueChange={setResourceTypeFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Resources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Resources</SelectItem>
                  <SelectItem value="prompt">Prompts</SelectItem>
                  <SelectItem value="prompt_version">Prompt Versions</SelectItem>
                  <SelectItem value="user">Users</SelectItem>
                  <SelectItem value="approval">Approvals</SelectItem>
                  <SelectItem value="api_key">API Keys</SelectItem>
                </SelectContent>
              </Select>

              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="updated">Updated</SelectItem>
                  <SelectItem value="deleted">Deleted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="requested_approval">Requested Approval</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Audit Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>Activity Log ({filteredLogs.length} entries)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Activities Found</h3>
                <p className="text-muted-foreground">
                  {searchQuery || resourceTypeFilter || actionFilter
                    ? "No activities match your current filters."
                    : "No activities recorded yet."
                  }
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Resource</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log: AuditLog) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {log.user 
                                  ? `${log.user.firstName} ${log.user.lastName}`
                                  : "Unknown User"
                                }
                              </p>
                              <p className="text-xs text-muted-foreground">
                                @{log.user?.username || "unknown"} • {log.user?.role?.replace('_', ' ') || "unknown role"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getActionBadge(log.action)}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {getResourceTypeBadge(log.resourceType)}
                            <p className="text-xs text-muted-foreground">
                              ID: {log.resourceId}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.details ? (
                            <div className="max-w-xs">
                              <div className="text-sm text-muted-foreground">
                                {Object.entries(log.details).map(([key, value]) => (
                                  <div key={key} className="truncate">
                                    <span className="font-medium">{key}:</span> {String(value)}
                                  </div>
                                )).slice(0, 2)}
                                {Object.entries(log.details).length > 2 && (
                                  <div className="text-xs">
                                    +{Object.entries(log.details).length - 2} more...
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">No details</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{format(new Date(log.createdAt), "MMM d, yyyy")}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(log.createdAt), "h:mm:ss a")}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
