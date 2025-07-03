import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getAuthHeaders } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Key, Settings, Brain, Zap, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LLMProvider {
  id: number;
  name: string;
  displayName: string;
  baseUrl: string;
  apiKeyRequired: boolean;
  isActive: boolean;
  models: Array<{
    id: string;
    name: string;
    contextWindow: number;
    inputCostPer1k: number;
    outputCostPer1k: number;
    capabilities: string[];
  }>;
}

interface UserLLMConfig {
  id: number;
  providerId: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function LLMSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Fetch available LLM providers
  const { data: providers = [], isLoading: providersLoading } = useQuery({
    queryKey: ['/api/llm-providers'],
    meta: { headers: getAuthHeaders() },
  });

  // Fetch user's LLM configurations
  const { data: userConfigs = [], isLoading: configsLoading } = useQuery({
    queryKey: ['/api/llm-configs'],
    meta: { headers: getAuthHeaders() },
  });

  const addConfigMutation = useMutation({
    mutationFn: async (data: { providerId: number; apiKey: string }) => {
      return apiRequest('/api/llm-configs', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/llm-configs'] });
      setIsAddDialogOpen(false);
      setSelectedProviderId(null);
      setApiKey("");
      toast({
        title: "Configuration Added",
        description: "LLM provider configuration has been saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add LLM configuration",
        variant: "destructive",
      });
    },
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (configId: number) => {
      return apiRequest(`/api/llm-configs/${configId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/llm-configs'] });
      toast({
        title: "Configuration Removed",
        description: "LLM provider configuration has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove LLM configuration",
        variant: "destructive",
      });
    },
  });

  const handleAddConfig = () => {
    if (!selectedProviderId || !apiKey.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a provider and enter an API key",
        variant: "destructive",
      });
      return;
    }

    addConfigMutation.mutate({
      providerId: selectedProviderId,
      apiKey: apiKey.trim(),
    });
  };

  const handleDeleteConfig = (configId: number) => {
    deleteConfigMutation.mutate(configId);
  };

  const getProviderInfo = (providerId: number) => {
    return providers.find((p: LLMProvider) => p.id === providerId);
  };

  const getConfiguredProviders = () => {
    return userConfigs.map((config: UserLLMConfig) => {
      const provider = getProviderInfo(config.providerId);
      return { ...config, provider };
    });
  };

  const getAvailableProviders = () => {
    const configuredProviderIds = userConfigs.map((config: UserLLMConfig) => config.providerId);
    return providers.filter((provider: LLMProvider) => 
      !configuredProviderIds.includes(provider.id) && provider.isActive
    );
  };

  const formatCost = (costInCents: number) => {
    return `$${(costInCents / 100).toFixed(4)}`;
  };

  if (providersLoading || configsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">LLM Settings</h1>
          <p className="text-muted-foreground">
            Configure your AI model providers and API keys
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Provider
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add LLM Provider</DialogTitle>
              <DialogDescription>
                Configure a new AI model provider for prompt testing and comparison
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="provider-select">Select Provider</Label>
                <Select 
                  value={selectedProviderId?.toString()} 
                  onValueChange={(value) => setSelectedProviderId(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an AI provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableProviders().map((provider: LLMProvider) => (
                      <SelectItem key={provider.id} value={provider.id.toString()}>
                        <div className="flex items-center space-x-2">
                          <Brain className="h-4 w-4" />
                          <span>{provider.displayName}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="Enter your API key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Your API key will be encrypted and stored securely
                </p>
              </div>

              {selectedProviderId && (
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-medium mb-2">Provider Information</h4>
                  {(() => {
                    const provider = getProviderInfo(selectedProviderId);
                    return provider ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Provider:</span>
                          <span className="font-medium">{provider.displayName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Models:</span>
                          <span className="font-medium">{provider.models.length} available</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Base URL:</span>
                          <span className="font-mono text-xs">{provider.baseUrl}</span>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddConfig}
                disabled={addConfigMutation.isPending || !selectedProviderId || !apiKey.trim()}
              >
                {addConfigMutation.isPending ? "Adding..." : "Add Configuration"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="configured" className="space-y-4">
        <TabsList>
          <TabsTrigger value="configured">Configured Providers</TabsTrigger>
          <TabsTrigger value="available">Available Providers</TabsTrigger>
        </TabsList>

        <TabsContent value="configured" className="space-y-4">
          {userConfigs.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No Providers Configured</h3>
                <p className="text-muted-foreground mb-4">
                  Add an AI provider to start testing and comparing prompts
                </p>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Provider
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {getConfiguredProviders().map((config) => (
                <Card key={config.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Brain className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">
                            {config.provider?.displayName}
                          </CardTitle>
                          <CardDescription>
                            {config.provider?.models.length} models available
                          </CardDescription>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Badge variant={config.isActive ? "default" : "secondary"}>
                          {config.isActive ? "Active" : "Inactive"}
                        </Badge>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              disabled={deleteConfigMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Provider Configuration</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove the configuration for {config.provider?.displayName}? 
                                This action cannot be undone and you'll need to re-enter your API key.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteConfig(config.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove Configuration
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Configured:</span>
                          <span className="ml-2 font-medium">
                            {new Date(config.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Last Updated:</span>
                          <span className="ml-2 font-medium">
                            {new Date(config.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {config.provider && (
                        <div>
                          <h4 className="font-medium mb-2">Available Models</h4>
                          <div className="grid gap-2">
                            {config.provider.models.map((model) => (
                              <div 
                                key={model.id}
                                className="flex items-center justify-between p-2 bg-muted rounded-lg"
                              >
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">{model.name}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {model.contextWindow.toLocaleString()} tokens
                                  </Badge>
                                </div>
                                
                                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                                  <div className="flex items-center space-x-1">
                                    <DollarSign className="h-3 w-3" />
                                    <span>{formatCost(model.inputCostPer1k)}</span>
                                  </div>
                                  <span>/</span>
                                  <div className="flex items-center space-x-1">
                                    <DollarSign className="h-3 w-3" />
                                    <span>{formatCost(model.outputCostPer1k)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="available" className="space-y-4">
          <div className="grid gap-4">
            {providers.map((provider: LLMProvider) => (
              <Card key={provider.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-muted rounded-lg">
                        <Brain className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{provider.displayName}</CardTitle>
                        <CardDescription>
                          {provider.models.length} models • {provider.baseUrl}
                        </CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Badge variant={provider.isActive ? "default" : "secondary"}>
                        {provider.isActive ? "Available" : "Disabled"}
                      </Badge>
                      
                      {userConfigs.some((config: UserLLMConfig) => config.providerId === provider.id) ? (
                        <Badge variant="outline">Configured</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedProviderId(provider.id);
                            setIsAddDialogOpen(true);
                          }}
                          disabled={!provider.isActive}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Configure
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">API Key Required:</span>
                        <span className="ml-2 font-medium">
                          {provider.apiKeyRequired ? "Yes" : "No"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Base URL:</span>
                        <span className="ml-2 font-mono text-xs">{provider.baseUrl}</span>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Available Models</h4>
                      <div className="grid gap-2">
                        {provider.models.map((model) => (
                          <div 
                            key={model.id}
                            className="flex items-center justify-between p-2 bg-muted rounded-lg"
                          >
                            <div className="flex items-center space-x-2">
                              <span className="font-medium">{model.name}</span>
                              <div className="flex space-x-1">
                                {model.capabilities.map((capability) => (
                                  <Badge key={capability} variant="outline" className="text-xs">
                                    {capability}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            
                            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                              <Badge variant="outline">
                                {model.contextWindow.toLocaleString()} tokens
                              </Badge>
                              <span>{formatCost(model.inputCostPer1k)}/{formatCost(model.outputCostPer1k)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}