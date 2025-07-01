import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { TestTube, Play, Save, RotateCcw, Clock } from "lucide-react";

export default function TestingSandbox() {
  const [promptContent, setPromptContent] = useState("");
  const [testInput, setTestInput] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Array<{
    id: string;
    input: string;
    output: string;
    timestamp: Date;
    success: boolean;
  }>>([]);

  const handleRunTest = () => {
    // Simulate test execution
    const newTest = {
      id: Date.now().toString(),
      input: testInput,
      output: "This is a simulated response based on the prompt and input provided. In a real implementation, this would be the actual AI response.",
      timestamp: new Date(),
      success: Math.random() > 0.2, // 80% success rate simulation
    };

    setTestResults(prev => [newTest, ...prev.slice(0, 9)]); // Keep last 10 tests
  };

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground flex items-center">
            <TestTube className="mr-2 h-6 w-6" />
            Testing Sandbox
          </h1>
          <p className="text-muted-foreground mt-2">
            Test your prompts with sample inputs in a safe environment before deployment.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Test Configuration */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Prompt Configuration</CardTitle>
                <CardDescription>
                  Configure your prompt and test variables
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="prompt-content">Prompt Content</Label>
                  <Textarea
                    id="prompt-content"
                    placeholder="Enter your prompt here..."
                    className="mt-1 font-mono text-sm"
                    rows={8}
                    value={promptContent}
                    onChange={(e) => setPromptContent(e.target.value)}
                  />
                </div>

                <Separator />

                <div>
                  <Label>Variables</Label>
                  <div className="space-y-2 mt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Variable name" />
                      <Input placeholder="Variable value" />
                    </div>
                    <Button variant="outline" size="sm">
                      Add Variable
                    </Button>
                  </div>
                </div>

                <Separator />

                <div>
                  <Label htmlFor="test-input">Test Input</Label>
                  <Textarea
                    id="test-input"
                    placeholder="Enter test input data..."
                    className="mt-1"
                    rows={4}
                    value={testInput}
                    onChange={(e) => setTestInput(e.target.value)}
                  />
                </div>

                <div className="flex space-x-2">
                  <Button onClick={handleRunTest} className="flex-1">
                    <Play className="mr-2 h-4 w-4" />
                    Run Test
                  </Button>
                  <Button variant="outline">
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                  <Button variant="outline">
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Test Results */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Test Results</CardTitle>
                <CardDescription>
                  View outputs and performance metrics from your tests
                </CardDescription>
              </CardHeader>
              <CardContent>
                {testResults.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <TestTube className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No test results yet</p>
                    <p className="text-sm">Run a test to see results here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {testResults.map((result) => (
                      <div key={result.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <Badge
                              className={
                                result.success
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                              }
                            >
                              {result.success ? "Success" : "Failed"}
                            </Badge>
                            <span className="text-xs text-muted-foreground flex items-center">
                              <Clock className="mr-1 h-3 w-3" />
                              {result.timestamp.toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs font-medium">Input</Label>
                            <div className="text-sm bg-muted p-2 rounded mt-1">
                              {result.input || "No input provided"}
                            </div>
                          </div>
                          
                          <div>
                            <Label className="text-xs font-medium">Output</Label>
                            <div className="text-sm bg-muted p-2 rounded mt-1">
                              {result.output}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Test Statistics */}
            <Card>
              <CardHeader>
                <CardTitle>Test Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total Tests</span>
                    <span className="text-sm font-medium">{testResults.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Success Rate</span>
                    <span className="text-sm font-medium">
                      {testResults.length > 0
                        ? `${Math.round(
                            (testResults.filter(r => r.success).length / testResults.length) * 100
                          )}%`
                        : "0%"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Avg Response Time</span>
                    <span className="text-sm font-medium">245ms</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
