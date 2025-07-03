import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getAuthHeaders } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Heart, Star, Clock, DollarSign, Zap, Brain } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LLMProvider {
  id: number;
  name: string;
  displayName: string;
  models: Array<{
    id: string;
    name: string;
    contextWindow: number;
    inputCostPer1k: number;
    outputCostPer1k: number;
    capabilities: string[];
  }>;
}

interface Prompt {
  id: number;
  name: string;
  content: string;
  variables: string[];
}

interface ComparisonResult {
  modelId: string;
  response: string;
  responseTime: number;
  tokens: { input: number; output: number };
  cost: number;
  score?: number;
  notes?: string;
  success: boolean;
  error?: string;
}

interface Comparison {
  id: number;
  name: string;
  description: string;
  promptId: number;
  models: string[];
  inputData: Record<string, any>;
  results: ComparisonResult[];
  createdAt: string;
}

export default function LLMComparison() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [inputVariables, setInputVariables] = useState<Record<string, string>>({});
  const [comparisonName, setComparisonName] = useState("");
  const [activeComparison, setActiveComparison] = useState<Comparison | null>(null);

  // Fetch available LLM providers
  const { data: providers = [] } = useQuery({
    queryKey: ['/api/llm-providers'],
    meta: { headers: getAuthHeaders() },
  });

  // Fetch user's prompts
  const { data: prompts = [] } = useQuery({
    queryKey: ['/api/prompts'],
    meta: { headers: getAuthHeaders() },
  });

  // Fetch user's LLM configurations
  const { data: userConfigs = [] } = useQuery({
    queryKey: ['/api/llm-configs'],
    meta: { headers: getAuthHeaders() },
  });

  // Fetch user's comparison history
  const { data: comparisons = [] } = useQuery({
    queryKey: ['/api/comparisons'],
    meta: { headers: getAuthHeaders() },
  });

  const selectedPrompt = prompts.find((p: Prompt) => p.id === selectedPromptId);

  // Get available models from configured providers
  const availableModels = providers.flatMap((provider: LLMProvider) => 
    provider.models.map(model => ({
      ...model,
      providerId: provider.id,
      providerName: provider.name,
      fullId: `${provider.name}:${model.id}`,
    }))
  ).filter(model => 
    userConfigs.some((config: any) => config.providerId === model.providerId)
  );

  const runComparisonMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description: string;
      promptId: number;
      models: string[];
      inputData: Record<string, any>;
    }) => {
      return apiRequest('/api/comparisons', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: getAuthHeaders(),
      });
    },
    onSuccess: (comparison) => {
      queryClient.invalidateQueries({ queryKey: ['/api/comparisons'] });
      setActiveComparison(comparison);
      toast({
        title: "Comparison Complete",
        description: `Successfully compared across ${comparison.results.length} models`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to run comparison",
        variant: "destructive",
      });
    },
  });

  const scoreModelMutation = useMutation({
    mutationFn: async ({ comparisonId, modelId, score, notes }: {
      comparisonId: number;
      modelId: string;
      score: number;
      notes?: string;
    }) => {
      return apiRequest(`/api/comparisons/${comparisonId}/score`, {
        method: 'PUT',
        body: JSON.stringify({ modelId, score, notes }),
        headers: getAuthHeaders(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/comparisons'] });
      toast({
        title: "Score Updated",
        description: "Model score has been saved",
      });
    },
  });

  const handleRunComparison = () => {
    if (!selectedPromptId || selectedModels.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please select a prompt and at least one model",
        variant: "destructive",
      });
      return;
    }

    runComparisonMutation.mutate({
      name: comparisonName || `Comparison ${new Date().toLocaleDateString()}`,
      description: `Comparing ${selectedModels.length} models`,
      promptId: selectedPromptId,
      models: selectedModels,
      inputData: inputVariables,
    });
  };

  const handleModelSelection = (modelId: string, checked: boolean) => {
    if (checked) {
      setSelectedModels([...selectedModels, modelId]);
    } else {
      setSelectedModels(selectedModels.filter(id => id !== modelId));
    }
  };

  const handleVariableChange = (variable: string, value: string) => {
    setInputVariables(prev => ({ ...prev, [variable]: value }));
  };

  const handleScoreUpdate = (comparisonId: number, modelId: string, score: number, notes?: string) => {
    scoreModelMutation.mutate({ comparisonId, modelId, score, notes });
  };

  const getModelDisplayName = (fullModelId: string) => {
    const model = availableModels.find(m => m.fullId === fullModelId);
    return model ? `${model.providerName} ${model.name}` : fullModelId;
  };

  const formatCost = (costInCents: number) => {
    return `$${(costInCents / 100).toFixed(4)}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">LLM Comparison</h1>
          <p className="text-muted-foreground">
            Compare prompt responses across multiple AI models
          </p>
        </div>
      </div>

      <Tabs defaultValue="new-comparison" className="space-y-4">
        <TabsList>
          <TabsTrigger value="new-comparison">New Comparison</TabsTrigger>
          <TabsTrigger value="history">Comparison History</TabsTrigger>
        </TabsList>

        <TabsContent value="new-comparison" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Configuration Panel */}
            <Card>
              <CardHeader>
                <CardTitle>Comparison Setup</CardTitle>
                <CardDescription>
                  Configure your multi-model prompt comparison
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="comparison-name">Comparison Name</Label>
                  <Input
                    id="comparison-name"
                    placeholder="Enter comparison name"
                    value={comparisonName}
                    onChange={(e) => setComparisonName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prompt-select">Select Prompt</Label>
                  <Select value={selectedPromptId?.toString()} onValueChange={(value) => setSelectedPromptId(parseInt(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a prompt to test" />
                    </SelectTrigger>
                    <SelectContent>
                      {prompts.map((prompt: Prompt) => (
                        <SelectItem key={prompt.id} value={prompt.id.toString()}>
                          {prompt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedPrompt?.variables && selectedPrompt.variables.length > 0 && (
                  <div className="space-y-2">
                    <Label>Prompt Variables</Label>
                    {selectedPrompt.variables.map((variable) => (
                      <div key={variable} className="space-y-1">
                        <Label htmlFor={`var-${variable}`} className="text-sm">
                          {variable}
                        </Label>
                        <Input
                          id={`var-${variable}`}
                          placeholder={`Enter value for ${variable}`}
                          value={inputVariables[variable] || ""}
                          onChange={(e) => handleVariableChange(variable, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Select Models to Compare</Label>
                  <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-3">
                    {availableModels.map((model) => (
                      <div key={model.fullId} className="flex items-center space-x-2">
                        <Checkbox
                          id={model.fullId}
                          checked={selectedModels.includes(model.fullId)}
                          onCheckedChange={(checked) => 
                            handleModelSelection(model.fullId, checked as boolean)
                          }
                        />
                        <Label
                          htmlFor={model.fullId}
                          className="flex-1 flex items-center justify-between cursor-pointer"
                        >
                          <span>{model.providerName} {model.name}</span>
                          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                            <Badge variant="outline">{formatCost(model.inputCostPer1k)}/1k</Badge>
                            <Badge variant="outline">{model.contextWindow.toLocaleString()}</Badge>
                          </div>
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <Button 
                  onClick={handleRunComparison}
                  disabled={runComparisonMutation.isPending || !selectedPromptId || selectedModels.length === 0}
                  className="w-full"
                >
                  {runComparisonMutation.isPending ? "Running Comparison..." : "Run Comparison"}
                </Button>
              </CardContent>
            </Card>

            {/* Preview Panel */}
            <Card>
              <CardHeader>
                <CardTitle>Prompt Preview</CardTitle>
                <CardDescription>
                  Review the prompt that will be sent to all models
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedPrompt ? (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Prompt Content</Label>
                      <Textarea
                        value={selectedPrompt.content}
                        readOnly
                        className="mt-1"
                        rows={8}
                      />
                    </div>
                    
                    {selectedPrompt.variables?.length > 0 && (
                      <div>
                        <Label className="text-sm font-medium">Variables</Label>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedPrompt.variables.map((variable) => (
                            <Badge key={variable} variant="secondary">
                              {variable}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <Label className="text-sm font-medium">Selected Models</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {selectedModels.map((modelId) => (
                          <Badge key={modelId} variant="outline">
                            {getModelDisplayName(modelId)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    Select a prompt to see preview
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Results Panel */}
          {activeComparison && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Comparison Results
                  <Badge variant="secondary">{activeComparison.results.length} models</Badge>
                </CardTitle>
                <CardDescription>
                  Compare responses and rate each model's performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6">
                  {activeComparison.results.map((result, index) => (
                    <Card key={`${result.modelId}-${index}`} className="border-l-4 border-l-blue-500">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">
                            {getModelDisplayName(result.modelId)}
                          </CardTitle>
                          <div className="flex items-center space-x-2">
                            {result.success ? (
                              <Badge variant="default">Success</Badge>
                            ) : (
                              <Badge variant="destructive">Failed</Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {result.responseTime}ms
                          </div>
                          <div className="flex items-center gap-1">
                            <Zap className="h-4 w-4" />
                            {result.tokens.input + result.tokens.output} tokens
                          </div>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4" />
                            {formatCost(result.cost)}
                          </div>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="space-y-4">
                        {result.success ? (
                          <>
                            <div>
                              <Label className="text-sm font-medium">Response</Label>
                              <Textarea
                                value={result.response}
                                readOnly
                                className="mt-1"
                                rows={6}
                              />
                            </div>

                            <Separator />

                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <Label className="text-sm">Rate this response:</Label>
                                <div className="flex items-center space-x-1">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Button
                                      key={star}
                                      variant="ghost"
                                      size="sm"
                                      className="p-1"
                                      onClick={() => 
                                        handleScoreUpdate(activeComparison.id, result.modelId, star)
                                      }
                                    >
                                      <Star 
                                        className={`h-4 w-4 ${
                                          result.score && result.score >= star 
                                            ? 'fill-yellow-400 text-yellow-400' 
                                            : 'text-gray-300'
                                        }`}
                                      />
                                    </Button>
                                  ))}
                                </div>
                                {result.score && (
                                  <span className="text-sm text-muted-foreground">
                                    {result.score}/5 stars
                                  </span>
                                )}
                              </div>
                            </div>

                            {result.notes && (
                              <div>
                                <Label className="text-sm font-medium">Notes</Label>
                                <p className="text-sm text-muted-foreground mt-1">{result.notes}</p>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-center py-4">
                            <p className="text-destructive font-medium">Request Failed</p>
                            {result.error && (
                              <p className="text-sm text-muted-foreground mt-1">{result.error}</p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="grid gap-4">
            {comparisons.map((comparison: Comparison) => (
              <Card key={comparison.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{comparison.name}</CardTitle>
                    <Badge variant="outline">
                      {new Date(comparison.createdAt).toLocaleDateString()}
                    </Badge>
                  </div>
                  <CardDescription>{comparison.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <span>{comparison.models.length} models compared</span>
                      <span>{comparison.results.filter(r => r.success).length} successful</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveComparison(comparison)}
                    >
                      View Results
                    </Button>
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