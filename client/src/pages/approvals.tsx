import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth, hasRole, getAuthHeaders } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { 
  CheckCircle, XCircle, Clock, Eye, User, FileText,
  MessageSquare, AlertCircle
} from "lucide-react";

interface Approval {
  id: number;
  promptId: number;
  versionId: number;
  requesterId: number;
  approverId?: number;
  status: "pending" | "approved" | "rejected";
  comments?: string;
  requestedAt: string;
  reviewedAt?: string;
  prompt?: {
    name: string;
    description: string;
    category: string;
  };
  requester?: {
    firstName: string;
    lastName: string;
    username: string;
  };
  approver?: {
    firstName: string;
    lastName: string;
    username: string;
  };
}

export default function Approvals() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject">("approve");
  const [reviewComments, setReviewComments] = useState("");

  // Check if user has approval permissions
  const canApprove = hasRole(user, ["engineering_lead", "admin"]);

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ["/api/approvals", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      
      const response = await fetch(`/api/approvals?${params}`, {
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch approvals");
      }
      
      return response.json();
    },
    enabled: canApprove,
  });

  const reviewApprovalMutation = useMutation({
    mutationFn: async ({ id, status, comments }: { id: number; status: "approved" | "rejected"; comments: string }) => {
      const response = await apiRequest("PUT", `/api/approvals/${id}`, {
        status,
        comments,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prompts/stats"] });
      toast({
        title: "Success",
        description: `Approval ${reviewAction === "approve" ? "approved" : "rejected"} successfully`,
      });
      setReviewDialogOpen(false);
      setSelectedApproval(null);
      setReviewComments("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleReview = (approval: Approval, action: "approve" | "reject") => {
    setSelectedApproval(approval);
    setReviewAction(action);
    setReviewDialogOpen(true);
  };

  const submitReview = () => {
    if (!selectedApproval) return;
    
    reviewApprovalMutation.mutate({
      id: selectedApproval.id,
      status: reviewAction === "approve" ? "approved" : "rejected",
      comments: reviewComments,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };

    const icons = {
      pending: Clock,
      approved: CheckCircle,
      rejected: XCircle,
    };

    const Icon = icons[status as keyof typeof icons];

    return (
      <Badge className={variants[status as keyof typeof variants]}>
        <Icon className="w-3 h-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  if (!canApprove) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Access Denied</h3>
              <p className="text-muted-foreground">
                You don't have permission to view approvals. Contact your administrator for access.
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

  const pendingCount = approvals.filter((a: Approval) => a.status === "pending").length;

  return (
    <>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground flex items-center">
              <CheckCircle className="mr-2 h-6 w-6" />
              Approvals
              {pendingCount > 0 && (
                <Badge className="ml-3 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                  {pendingCount} pending
                </Badge>
              )}
            </h1>
            <p className="text-muted-foreground mt-2">
              Review and approve prompt submissions before they go live in production.
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Clock className="h-8 w-8 text-orange-500" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Pending Review</p>
                    <p className="text-2xl font-semibold text-foreground">
                      {approvals.filter((a: Approval) => a.status === "pending").length}
                    </p>
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
                    <p className="text-2xl font-semibold text-foreground">
                      {approvals.filter((a: Approval) => a.status === "approved").length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <XCircle className="h-8 w-8 text-red-500" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-muted-foreground">Rejected</p>
                    <p className="text-2xl font-semibold text-foreground">
                      {approvals.filter((a: Approval) => a.status === "rejected").length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Approvals Table */}
          <Card>
            <CardHeader>
              <CardTitle>Approval Requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {approvals.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No Approvals Found</h3>
                  <p className="text-muted-foreground">
                    {statusFilter ? "No approvals match your current filter." : "No approval requests at this time."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Prompt</TableHead>
                        <TableHead>Requester</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Reviewed</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {approvals.map((approval: Approval) => (
                        <TableRow key={approval.id}>
                          <TableCell>
                            <div className="flex items-start space-x-3">
                              <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                <FileText className="h-4 w-4 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground">
                                  {approval.prompt?.name || `Prompt #${approval.promptId}`}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {approval.prompt?.description || "No description"}
                                </p>
                                <Badge variant="outline" className="mt-1">
                                  {approval.prompt?.category?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || "Unknown"}
                                </Badge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                                <User className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">
                                  {approval.requester 
                                    ? `${approval.requester.firstName} ${approval.requester.lastName}`
                                    : "Unknown User"
                                  }
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  @{approval.requester?.username || "unknown"}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(approval.status)}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{format(new Date(approval.requestedAt), "MMM d, yyyy")}</div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(approval.requestedAt), "h:mm a")}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {approval.reviewedAt ? (
                              <div className="text-sm">
                                <div>{format(new Date(approval.reviewedAt), "MMM d, yyyy")}</div>
                                <div className="text-xs text-muted-foreground">
                                  by {approval.approver 
                                    ? `${approval.approver.firstName} ${approval.approver.lastName}`
                                    : "Unknown"
                                  }
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Button variant="ghost" size="sm">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {approval.status === "pending" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-green-600 hover:text-green-700"
                                    onClick={() => handleReview(approval, "approve")}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => handleReview(approval, "reject")}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {approval.comments && (
                                <Button variant="ghost" size="sm">
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              )}
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

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve" ? "Approve" : "Reject"} Prompt
            </DialogTitle>
          </DialogHeader>
          
          {selectedApproval && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Prompt</Label>
                <p className="text-sm text-muted-foreground">
                  {selectedApproval.prompt?.name || `Prompt #${selectedApproval.promptId}`}
                </p>
              </div>
              
              <div>
                <Label className="text-sm font-medium">Requester</Label>
                <p className="text-sm text-muted-foreground">
                  {selectedApproval.requester 
                    ? `${selectedApproval.requester.firstName} ${selectedApproval.requester.lastName}`
                    : "Unknown User"
                  }
                </p>
              </div>
              
              <div>
                <Label htmlFor="review-comments">
                  {reviewAction === "approve" ? "Approval" : "Rejection"} Comments
                </Label>
                <Textarea
                  id="review-comments"
                  placeholder={`Add comments for this ${reviewAction}...`}
                  value={reviewComments}
                  onChange={(e) => setReviewComments(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={submitReview}
              disabled={reviewApprovalMutation.isPending}
              className={reviewAction === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {reviewApprovalMutation.isPending 
                ? `${reviewAction === "approve" ? "Approving" : "Rejecting"}...`
                : `${reviewAction === "approve" ? "Approve" : "Reject"}`
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
