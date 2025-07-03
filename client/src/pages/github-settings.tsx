import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Github, CheckCircle, XCircle, RefreshCw, Upload, 
  Database, Settings, ExternalLink 
} from "lucide-react";

interface GitHubConfig {
  enabled: boolean;
  owner: string | null;
  repo: string | null;
  branch: string;
}

interface RepoInfo {
  name: string;
  fullName: string;
  private: boolean;
  url: string;
  defaultBranch: string;
  updatedAt: string;
}

export default function GitHubSettings() {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  // Fetch GitHub configuration
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["/api/github/config"],
    queryFn: async () => {
      const response = await fetch("/api/github/config", {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch GitHub configuration");
      }
      return response.json() as Promise<GitHubConfig>;
    },
  });

  // Test GitHub connection
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/github/test");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.connected) {
        toast({
          title: "Connection Successful",
          description: "GitHub integration is working correctly",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: "Unable to connect to GitHub repository",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Connection Error",
        description: error instanceof Error ? error.message : "Failed to test connection",
        variant: "destructive",
      });
    },
  });

  // Initialize repository
  const initializeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/github/initialize");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Repository Initialized",
        description: data.message,
      });
    },
    onError: (error) => {
      toast({
        title: "Initialization Failed",
        description: error instanceof Error ? error.message : "Failed to initialize repository",
        variant: "destructive",
      });
    },
  });

  // Sync all prompts
  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/github/sync/all");
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sync Completed",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync prompts",
        variant: "destructive",
      });
    },
  });

  const handleTestConnection = () => {
    setIsConnecting(true);
    testConnectionMutation.mutate();
    setIsConnecting(false);
  };

  const handleInitialize = () => {
    setIsInitializing(true);
    initializeMutation.mutate();
    setTimeout(() => setIsInitializing(false), 2000);
  };

  const handleSyncAll = () => {
    setIsSyncing(true);
    syncAllMutation.mutate();
    setTimeout(() => setIsSyncing(false), 3000);
  };

  if (configLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const repoInfo = testConnectionMutation.data?.repoInfo as RepoInfo | undefined;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center space-x-2">
        <Github className="h-8 w-8" />
        <div>
          <h1 className="text-3xl font-bold">GitHub Integration</h1>
          <p className="text-muted-foreground">
            Manage prompt storage and versioning with GitHub
          </p>
        </div>
      </div>

      {/* Configuration Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Configuration Status</span>
          </CardTitle>
          <CardDescription>
            Current GitHub integration configuration and connection status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">Integration Status</span>
            <Badge variant={config?.enabled ? "default" : "secondary"}>
              {config?.enabled ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Enabled
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 mr-1" />
                  Disabled
                </>
              )}
            </Badge>
          </div>

          {config?.enabled && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Repository Owner</span>
                  <p className="font-mono">{config.owner}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Repository Name</span>
                  <p className="font-mono">{config.repo}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Branch</span>
                  <p className="font-mono">{config.branch}</p>
                </div>
              </div>
            </>
          )}

          {!config?.enabled && (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                GitHub integration is not configured. Please set the following environment variables:
                <code className="block mt-2 p-2 bg-yellow-100 rounded text-xs">
                  GITHUB_TOKEN=your_github_token<br/>
                  GITHUB_OWNER=your_username<br/>
                  GITHUB_REPO=your_repository<br/>
                  GITHUB_BRANCH=main (optional)
                </code>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Repository Information */}
      {config?.enabled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Database className="h-5 w-5" />
              <span>Repository Information</span>
            </CardTitle>
            <CardDescription>
              Details about the connected GitHub repository
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={isConnecting}
                className="flex items-center space-x-2"
              >
                <RefreshCw className={`h-4 w-4 ${isConnecting ? 'animate-spin' : ''}`} />
                <span>Test Connection</span>
              </Button>
            </div>

            {repoInfo && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Full Name</span>
                  <div className="flex items-center space-x-2">
                    <p className="font-mono">{repoInfo.fullName}</p>
                    <a
                      href={repoInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Visibility</span>
                  <Badge variant={repoInfo.private ? "destructive" : "default"}>
                    {repoInfo.private ? "Private" : "Public"}
                  </Badge>
                </div>
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Default Branch</span>
                  <p className="font-mono">{repoInfo.defaultBranch}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Last Updated</span>
                  <p className="text-sm">{new Date(repoInfo.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {config?.enabled && (
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
            <CardDescription>
              Manage prompt synchronization and repository setup
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                onClick={handleInitialize}
                disabled={isInitializing}
                className="flex items-center space-x-2"
              >
                <Settings className={`h-4 w-4 ${isInitializing ? 'animate-spin' : ''}`} />
                <span>Initialize Repository</span>
              </Button>

              <Button
                onClick={handleSyncAll}
                disabled={isSyncing}
                className="flex items-center space-x-2"
              >
                <Upload className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Sync All Prompts</span>
              </Button>
            </div>

            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Initialize Repository:</strong> Sets up the directory structure and README</p>
              <p><strong>Sync All Prompts:</strong> Uploads all existing prompts to GitHub</p>
              <p><strong>Auto-sync:</strong> New prompts and updates are automatically saved to GitHub</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}