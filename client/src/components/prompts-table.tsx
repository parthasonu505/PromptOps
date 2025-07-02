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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { getAuthHeaders } from "@/lib/auth";
import { 
  Code, Eye, Star, Edit, TestTube, History, MoreVertical,
  Filter, Download, Grid3X3, List, ChevronLeft, ChevronRight
} from "lucide-react";

interface Prompt {
  id: number;
  name: string;
  description: string;
  content: string;
  category: string;
  status: string;
  environment: string;
  accessLevel: string;
  authorId: number;
  usageCount: number;
  rating: number;
  createdAt: string;
  updatedAt: string;
}

export function PromptsTable() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({
    category: "",
    status: "",
    environment: "",
    search: "",
  });
  const [selectedPrompts, setSelectedPrompts] = useState<number[]>([]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");

  const { data: prompts = [], isLoading } = useQuery({
    queryKey: ["/api/prompts", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      
      const response = await fetch(`/api/prompts?${params}`, {
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch prompts");
      }
      
      return response.json();
    },
  });

  const handleSelectAll = (checked: boolean) => {
    setSelectedPrompts(checked ? prompts.map((p: Prompt) => p.id) : []);
  };

  const handleSelectPrompt = (promptId: number, checked: boolean) => {
    setSelectedPrompts(prev => 
      checked 
        ? [...prev, promptId]
        : prev.filter(id => id !== promptId)
    );
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      pending_review: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      draft: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
      rejected: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      archived: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    };

    return (
      <Badge className={variants[status as keyof typeof variants] || variants.draft}>
        <span className="w-1.5 h-1.5 mr-1.5 bg-current rounded-full opacity-60" />
        {status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </Badge>
    );
  };

  const getCategoryBadge = (category: string) => {
    const colors = {
      customer_support: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      content_generation: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      data_analysis: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      code_generation: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      translation: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
      other: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
    };

    return (
      <Badge className={colors[category as keyof typeof colors] || colors.other}>
        {category.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div className="flex flex-wrap items-center gap-4">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-32" />
              </div>
              <div className="flex items-center space-x-3">
                <Skeleton className="h-10 w-20" />
                <Skeleton className="h-10 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div className="flex flex-wrap items-center gap-4">
              <Select 
                value={filters.category} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger className="w-auto">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="customer_support">Customer Support</SelectItem>
                  <SelectItem value="content_generation">Content Generation</SelectItem>
                  <SelectItem value="data_analysis">Data Analysis</SelectItem>
                  <SelectItem value="code_generation">Code Generation</SelectItem>
                  <SelectItem value="translation">Translation</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>

              <Select 
                value={filters.status} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger className="w-auto">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>

              <Select 
                value={filters.environment} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, environment: value }))}
              >
                <SelectTrigger className="w-auto">
                  <SelectValue placeholder="All Environments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Environments</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline">
                <Filter className="mr-2 h-4 w-4" />
                More Filters
              </Button>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">View:</span>
                <Button
                  variant={viewMode === "grid" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prompts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Prompts</h3>
            <div className="flex items-center space-x-3">
              <span className="text-sm text-muted-foreground">
                Showing <span className="font-medium">1-{prompts.length}</span> of{" "}
                <span className="font-medium">{prompts.length}</span> results
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedPrompts.length === prompts.length && prompts.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Name & Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts.map((prompt: Prompt) => (
                  <TableRow key={prompt.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedPrompts.includes(prompt.id)}
                        onCheckedChange={(checked) => handleSelectPrompt(prompt.id, !!checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Code className="text-primary h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{prompt.name}</p>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {prompt.description || "No description"}
                          </p>
                          <div className="flex items-center mt-2 space-x-4 text-xs text-muted-foreground">
                            <span className="flex items-center">
                              <Eye className="mr-1 h-3 w-3" />
                              {prompt.usageCount} uses
                            </span>
                            <span className="flex items-center">
                              <Star className="mr-1 h-3 w-3" />
                              {(prompt.rating / 10).toFixed(1)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getCategoryBadge(prompt.category)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(prompt.status)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {prompt.environment.charAt(0).toUpperCase() + prompt.environment.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{format(new Date(prompt.updatedAt), "MMM d, yyyy")}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(prompt.updatedAt), "h:mm a")}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <TestTube className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <History className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-3 border-t">
            <div className="flex-1 flex justify-between sm:hidden">
              <Button variant="outline">Previous</Button>
              <Button variant="outline">Next</Button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Showing <span className="font-medium">1</span> to{" "}
                  <span className="font-medium">{prompts.length}</span> of{" "}
                  <span className="font-medium">{prompts.length}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-lg shadow-sm -space-x-px">
                  <Button variant="outline" size="sm">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" className="bg-primary text-primary-foreground">
                    1
                  </Button>
                  <Button variant="outline" size="sm">
                    2
                  </Button>
                  <Button variant="outline" size="sm">
                    3
                  </Button>
                  <Button variant="outline" size="sm">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </nav>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
