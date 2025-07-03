import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { 
  Github, Play, Copy, Zap, Eye, Brain, 
  MessageSquare, Code, Globe, Sparkles 
} from "lucide-react";

interface GitHubModel {
  id: string;
  name: string;
  contextWindow: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
  capabilities: string[];
}

interface PlaygroundResult {
  response: string;
  responseTime: number;
  tokens: {
    input: number;
    output: number;
  };
  cost: number;
  modelId: string;
  success: boolean;
  error?: string;
}

export default function GitHubModelsPlayground() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("Explain quantum computing in simple terms for a beginner.");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [temperature, setTemperature] = useState([0.7]);
  const [maxTokens, setMaxTokens] = useState([1000]);
  const [useSystemPrompt, setUseSystemPrompt] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant that provides clear and concise explanations.");

  // Fetch available GitHub Models
  const { data: providers, isLoading: providersLoading } = useQuery({
    queryKey: ["/api/llm-providers"],
    queryFn: async () => {
      const response = await fetch("/api/llm-providers", {
        headers: getAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch LLM providers");
      }
      return response.json();
    },
  });

  const githubModelsProvider = providers?.find((p: any) => p.name === 'github_models');
  const githubModels: GitHubModel[] = githubModelsProvider?.models || [];

  // Test prompt mutation
  const testPromptMutation = useMutation({
    mutationFn: async (data: {
      prompt: string;
      modelId: string;
      options: any;
    }) => {
      const response = await apiRequest("POST", "/api/llm/test", {
        provider: "github_models",
        modelId: data.modelId,
        prompt: data.prompt,
        options: data.options,
      });
      return response.json();
    },
    onSuccess: (data: PlaygroundResult) => {
      if (data.success) {
        toast({
          title: "Prompt Test Successful",
          description: `Response generated in ${data.responseTime}ms`,
        });
      } else {
        toast({
          title: "Prompt Test Failed",
          description: data.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Test Failed",
        description: error instanceof Error ? error.message : "Failed to test prompt",
        variant: "destructive",
      });
    },
  });

  const handleTestPrompt = () => {
    if (!selectedModel) {
      toast({
        title: "Model Required",
        description: "Please select a GitHub model to test",
        variant: "destructive",
      });
      return;
    }

    if (!prompt.trim()) {
      toast({
        title: "Prompt Required",
        description: "Please enter a prompt to test",
        variant: "destructive",
      });
      return;
    }

    const fullPrompt = useSystemPrompt && systemPrompt 
      ? `System: ${systemPrompt}\n\nUser: ${prompt}`
      : prompt;

    testPromptMutation.mutate({
      prompt: fullPrompt,
      modelId: selectedModel,
      options: {
        temperature: temperature[0],
        max_tokens: maxTokens[0],
      },
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Content copied to clipboard",
    });
  };

  const getCapabilityIcon = (capability: string) => {
    switch (capability.toLowerCase()) {
      case 'text': return <MessageSquare className="h-3 w-3" />;
      case 'vision': case 'multimodal': return <Eye className="h-3 w-3" />;
      case 'code': return <Code className="h-3 w-3" />;
      case 'reasoning': return <Brain className="h-3 w-3" />;
      case 'multilingual': return <Globe className="h-3 w-3" />;
      case 'fast_response': return <Zap className="h-3 w-3" />;
      case 'audio': return <Sparkles className="h-3 w-3" />;
      default: return <MessageSquare className="h-3 w-3" />;
    }
  };

  const selectedModelData = githubModels.find(m => m.id === selectedModel);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center space-x-2">
        <Github className="h-8 w-8" />
        <div>
          <h1 className="text-3xl font-bold">GitHub Models Playground</h1>
          <p className="text-muted-foreground">
            Test and experiment with cutting-edge AI models from GitHub Models
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Model Selection</CardTitle>
              <CardDescription>Choose a GitHub model to test your prompts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Model</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a GitHub model" />
                  </SelectTrigger>
                  <SelectContent>
                    {githubModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedModelData && (
                <div className="space-y-3 p-3 bg-muted rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Context Window</span>
                    <Badge variant="outline">{selectedModelData.contextWindow.toLocaleString()} tokens</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Cost</span>
                    <Badge variant="outline">Free tier</Badge>
                  </div>
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Capabilities</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedModelData.capabilities.map((capability) => (
                        <Badge key={capability} variant="secondary" className="text-xs">
                          {getCapabilityIcon(capability)}
                          <span className="ml-1">{capability}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prompt Configuration</CardTitle>
              <CardDescription>Configure your prompt and generation parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="system-prompt"
                  checked={useSystemPrompt}
                  onCheckedChange={setUseSystemPrompt}
                />
                <Label htmlFor="system-prompt">Use System Prompt</Label>
              </div>

              {useSystemPrompt && (
                <div>
                  <Label>System Prompt</Label>
                  <Textarea
                    placeholder="You are a helpful assistant..."
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={3}
                  />
                </div>
              )}

              <div>
                <Label>User Prompt</Label>
                <Textarea
                  placeholder="Enter your prompt here..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Temperature: {temperature[0]}</Label>
                  <Slider
                    value={temperature}
                    onValueChange={setTemperature}
                    max={1}
                    min={0}
                    step={0.1}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Controls creativity. Higher values = more creative, lower = more focused
                  </p>
                </div>

                <div>
                  <Label>Max Tokens: {maxTokens[0]}</Label>
                  <Slider
                    value={maxTokens}
                    onValueChange={setMaxTokens}
                    max={4000}
                    min={100}
                    step={100}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Maximum length of the generated response
                  </p>
                </div>
              </div>

              <Button
                onClick={handleTestPrompt}
                disabled={testPromptMutation.isPending || !selectedModel}
                className="w-full"
              >
                <Play className="h-4 w-4 mr-2" />
                {testPromptMutation.isPending ? "Testing..." : "Test Prompt"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Output Section */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Response</CardTitle>
              <CardDescription>
                {testPromptMutation.data ? (
                  <div className="flex items-center space-x-4 text-sm">
                    <span>Model: {testPromptMutation.data.modelId}</span>
                    <span>Time: {testPromptMutation.data.responseTime}ms</span>
                    <span>Tokens: {testPromptMutation.data.tokens.input + testPromptMutation.data.tokens.output}</span>
                  </div>
                ) : (
                  "Response will appear here after testing"
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {testPromptMutation.isPending && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              )}

              {testPromptMutation.data && testPromptMutation.data.success && (
                <div className="space-y-4">
                  <div className="relative">
                    <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap">
                      {testPromptMutation.data.response}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(testPromptMutation.data!.response)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Input Tokens:</span>
                      <p className="text-muted-foreground">{testPromptMutation.data.tokens.input}</p>
                    </div>
                    <div>
                      <span className="font-medium">Output Tokens:</span>
                      <p className="text-muted-foreground">{testPromptMutation.data.tokens.output}</p>
                    </div>
                    <div>
                      <span className="font-medium">Response Time:</span>
                      <p className="text-muted-foreground">{testPromptMutation.data.responseTime}ms</p>
                    </div>
                    <div>
                      <span className="font-medium">Cost:</span>
                      <p className="text-muted-foreground">Free (GitHub Models)</p>
                    </div>
                  </div>
                </div>
              )}

              {testPromptMutation.data && !testPromptMutation.data.success && (
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-destructive font-medium">Error:</p>
                  <p className="text-destructive/80">{testPromptMutation.data.error}</p>
                </div>
              )}

              {!testPromptMutation.data && !testPromptMutation.isPending && (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>Test a prompt to see the response here</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* GitHub Models Information */}
          <Card>
            <CardHeader>
              <CardTitle>About GitHub Models</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                GitHub Models provides free access to industry-leading AI models directly through GitHub's platform.
              </p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Free usage with rate limits</li>
                <li>• Multiple model providers (OpenAI, Meta, Microsoft, Mistral)</li>
                <li>• Multimodal capabilities (text, vision, audio)</li>
                <li>• Seamless GitHub integration</li>
                <li>• No prompts used for training</li>
              </ul>
              <div className="pt-2">
                <a
                  href="https://github.com/marketplace/models"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Learn more about GitHub Models →
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}