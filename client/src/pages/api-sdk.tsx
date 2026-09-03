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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { 
  Key, Plus, Copy, Eye, EyeOff, Trash2, Code, 
  Book, Shield, Clock, CheckCircle, AlertTriangle
} from "lucide-react";

interface ApiKey {
  id: number;
  name: string;
  permissions: string[];
  isActive: boolean;
  lastUsedAt?: string;
  createdAt: string;
  expiresAt?: string;
}

export default function ApiSdk() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createKeyDialogOpen, setCreateKeyDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>([]);
  const [newKeyExpiry, setNewKeyExpiry] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showGeneratedKey, setShowGeneratedKey] = useState(false);

  const { data: apiKeys = [], isLoading } = useQuery({
    queryKey: ["/api/api-keys"],
    queryFn: async () => {
      const response = await fetch("/api/api-keys", {
        headers: getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch API keys");
      }
      
      return response.json();
    },
  });

  const createApiKeyMutation = useMutation({
    // 1. Change permissions -> scopes, and expiresAt -> expires_in_days
    mutationFn: async (data: { name: string; scopes: string[]; expires_in_days?: number }) => {
      const response = await apiRequest("POST", "/api/api-keys", data);
      
      // 2. Add error handling so it doesn't crash on HTML pages
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const err = await response.json();
          throw new Error(err.detail || "Failed to create API key");
        }
        throw new Error("Server error: Check if API route exists and auth is passed.");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/api-keys"] });
      setGeneratedKey(data.key);
      setShowGeneratedKey(true);
      toast({
        title: "Success",
        description: "API key created successfully",
      });
      setCreateKeyDialogOpen(false);
      setNewKeyName("");
      setNewKeyPermissions([]);
      setNewKeyExpiry("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateKey = () => {
    const data: any = {
      name: newKeyName,
      scopes: newKeyPermissions, // CHANGED from 'permissions' to 'scopes'
    };
    
    if (newKeyExpiry && newKeyExpiry !== "never") {
      // CHANGED: Backend expects an integer of days, not a date string
      data.expires_in_days = parseInt(newKeyExpiry, 10);
    }
    
    createApiKeyMutation.mutate(data);
  };

  const handlePermissionChange = (permission: string, checked: boolean) => {
    setNewKeyPermissions(prev => 
      checked 
        ? [...prev, permission]
        : prev.filter(p => p !== permission)
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "API key copied to clipboard",
    });
  };

  const getStatusBadge = (apiKey: ApiKey) => {
    if (!apiKey.isActive) {
      return (
        <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Inactive
        </Badge>
      );
    }
    
    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Expired
        </Badge>
      );
    }
    
    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
        <CheckCircle className="w-3 h-3 mr-1" />
        Active
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <Skeleton className="h-8 w-64" />
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
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

  return (
    <>
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground flex items-center">
                  <Key className="mr-2 h-6 w-6" />
                  API & SDK
                </h1>
                <p className="text-muted-foreground mt-2">
                  Manage API keys and access developer resources for prompt consumption.
                </p>
              </div>
              <Button onClick={() => setCreateKeyDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create API Key
              </Button>
            </div>
          </div>

          <Tabs defaultValue="keys" className="space-y-6">
            <TabsList>
              <TabsTrigger value="keys">API Keys</TabsTrigger>
              <TabsTrigger value="documentation">Documentation</TabsTrigger>
              <TabsTrigger value="usage">Usage Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="keys" className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 mb-8">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <Key className="h-8 w-8 text-blue-500" />
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-muted-foreground">Total Keys</p>
                        <p className="text-2xl font-semibold text-foreground">{apiKeys.length}</p>
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
                        <p className="text-sm font-medium text-muted-foreground">Active Keys</p>
                        <p className="text-2xl font-semibold text-foreground">
                          {apiKeys.filter((key: ApiKey) => key.isActive).length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <Clock className="h-8 w-8 text-orange-500" />
                      </div>
                      <div className="ml-4">
                        <p className="text-sm font-medium text-muted-foreground">Recently Used</p>
                        <p className="text-2xl font-semibold text-foreground">
                          {apiKeys.filter((key: ApiKey) => 
                            key.lastUsedAt && 
                            new Date(key.lastUsedAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
                          ).length}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* API Keys Table */}
              <Card>
                <CardHeader>
                  <CardTitle>API Keys</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {apiKeys.length === 0 ? (
                    <div className="text-center py-12">
                      <Key className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">No API Keys</h3>
                      <p className="text-muted-foreground mb-4">
                        Create your first API key to start using the PromptOps API.
                      </p>
                      <Button onClick={() => setCreateKeyDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create API Key
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Permissions</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Last Used</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Expires</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {apiKeys.map((apiKey: ApiKey) => (
                            <TableRow key={apiKey.id}>
                              <TableCell>
                                <div className="flex items-center space-x-3">
                                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                                    <Key className="h-4 w-4 text-primary" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{apiKey.name}</p>
                                    <p className="text-xs text-muted-foreground">ID: {apiKey.id}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {apiKey.permissions.length === 0 ? (
                                    <Badge variant="outline">No permissions</Badge>
                                  ) : (
                                    apiKey.permissions.map((permission) => (
                                      <Badge key={permission} variant="outline" className="text-xs">
                                        {permission}
                                      </Badge>
                                    ))
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {getStatusBadge(apiKey)}
                              </TableCell>
                              <TableCell>
                                {apiKey.lastUsedAt ? (
                                  <div className="text-sm">
                                    <div>{format(new Date(apiKey.lastUsedAt), "MMM d, yyyy")}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {format(new Date(apiKey.lastUsedAt), "h:mm a")}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">Never</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  <div>{format(new Date(apiKey.createdAt), "MMM d, yyyy")}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {format(new Date(apiKey.createdAt), "h:mm a")}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {apiKey.expiresAt ? (
                                  <div className="text-sm">
                                    <div>{format(new Date(apiKey.expiresAt), "MMM d, yyyy")}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {new Date(apiKey.expiresAt) < new Date() ? "Expired" : "Active"}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">Never</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <Button variant="ghost" size="sm">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
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
            </TabsContent>

            <TabsContent value="documentation" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Book className="mr-2 h-5 w-5" />
                      API Documentation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-2">Base URL</h4>
                      <div className="bg-muted p-3 rounded-lg font-mono text-sm">
                        https://your-domain.com/api/public
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium mb-2">Authentication</h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Include your API key in the request headers:
                      </p>
                      <div className="bg-muted p-3 rounded-lg font-mono text-sm">
                        X-API-Key: your_api_key_here
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-2">Get Prompt</h4>
                      <div className="bg-muted p-3 rounded-lg font-mono text-sm">
                        GET /prompts/{"{"}{"}"}id{"}"}
                      </div>
                    </div>

                    <Button variant="outline" className="w-full">
                      <Book className="mr-2 h-4 w-4" />
                      View Full Documentation
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Code className="mr-2 h-5 w-5" />
                      Code Examples
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-2">JavaScript</h4>
                      <div className="bg-muted p-3 rounded-lg font-mono text-xs overflow-x-auto">
                        {`const response = await fetch('/api/public/prompts/1', {
  headers: {
    'X-API-Key': 'your_api_key'
  }
});
const prompt = await response.json();`}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-2">Python</h4>
                      <div className="bg-muted p-3 rounded-lg font-mono text-xs overflow-x-auto">
                        {`import requests

response = requests.get(
  'https://your-domain.com/api/public/prompts/1',
  headers={'X-API-Key': 'your_api_key'}
)
prompt = response.json()`}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-2">cURL</h4>
                      <div className="bg-muted p-3 rounded-lg font-mono text-xs overflow-x-auto">
                        {`curl -H "X-API-Key: your_api_key" \\
  https://your-domain.com/api/public/prompts/1`}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="usage" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Usage Analytics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <Shield className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">Usage Analytics</h3>
                    <p className="text-muted-foreground">
                      Usage analytics and metrics will be available here once API keys are actively used.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Create API Key Dialog */}
      <Dialog open={createKeyDialogOpen} onOpenChange={setCreateKeyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New API Key</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="Enter a descriptive name for this API key"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
              />
            </div>

            <div>
              <Label>Permissions</Label>
              <div className="space-y-2 mt-2">
                {[
                  { id: "read_prompts", label: "Read Prompts", description: "Access approved prompts" },
                  { id: "read_versions", label: "Read Versions", description: "Access prompt versions" },
                  { id: "usage_analytics", label: "Usage Analytics", description: "View usage statistics" },
                ].map((permission) => (
                  <div key={permission.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                    <Checkbox
                      checked={newKeyPermissions.includes(permission.id)}
                      onCheckedChange={(checked) => handlePermissionChange(permission.id, !!checked)}
                    />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium">{permission.label}</h4>
                      <p className="text-xs text-muted-foreground">{permission.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="key-expiry">Expiration (Optional)</Label>
              <Select value={newKeyExpiry} onValueChange={setNewKeyExpiry}>
                <SelectTrigger>
                  <SelectValue placeholder="Never expires" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never expires</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateKeyDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateKey}
              disabled={createApiKeyMutation.isPending || !newKeyName}
            >
              {createApiKeyMutation.isPending ? "Creating..." : "Create API Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generated Key Dialog */}
      <Dialog open={showGeneratedKey} onOpenChange={setShowGeneratedKey}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>API Key Created Successfully</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
                <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Important: Save your API key
                </h4>
              </div>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                This is the only time you'll see this key. Please copy and store it securely.
              </p>
            </div>

            <div>
              <Label>Your new API key</Label>
              <div className="flex items-center space-x-2 mt-1">
                <Input
                  value={generatedKey || ""}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(generatedKey || "")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button onClick={() => setShowGeneratedKey(false)}>
              I've saved my API key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
