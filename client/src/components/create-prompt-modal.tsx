import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { TestTube, Plus } from "lucide-react";

const createPromptSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  content: z.string().min(1, "Content is required"),
  category: z.string().min(1, "Category is required"),
  environment: z.string().default("development"),
  accessLevel: z.string().default("private"),
});

type CreatePromptFormData = z.infer<typeof createPromptSchema>;

interface CreatePromptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePromptModal({ open, onOpenChange }: CreatePromptModalProps) {
  const [isTestMode, setIsTestMode] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<CreatePromptFormData>({
    resolver: zodResolver(createPromptSchema),
    defaultValues: {
      name: "",
      description: "",
      content: "",
      category: "",
      environment: "development",
      accessLevel: "private",
    },
  });

  const createPromptMutation = useMutation({
    mutationFn: async (data: CreatePromptFormData) => {
      const response = await apiRequest("POST", "/api/prompts", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prompts/stats"] });
      toast({
        title: "Success",
        description: "Prompt created successfully",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: CreatePromptFormData) => {
    if (isTestMode) {
      // TODO: Implement test functionality
      toast({
        title: "Test Mode",
        description: "Testing functionality not yet implemented",
      });
      return;
    }
    
    createPromptMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Prompt</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Prompt Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Enter prompt name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Category <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="customer_support">Customer Support</SelectItem>
                        <SelectItem value="content_generation">Content Generation</SelectItem>
                        <SelectItem value="data_analysis">Data Analysis</SelectItem>
                        <SelectItem value="code_generation">Code Generation</SelectItem>
                        <SelectItem value="translation">Translation</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe what this prompt does..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Prompt Content <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="You are an AI assistant that..."
                      className="resize-none font-mono text-sm"
                      rows={8}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Use variables like {"{"}{"{"variable_name{"}"}{"}"}for dynamic content.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="environment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Target Environment</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="development">Development</SelectItem>
                        <SelectItem value="staging">Staging</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accessLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Access Level</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="team">Team</SelectItem>
                        <SelectItem value="organization">Organization</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsTestMode(true);
                  form.handleSubmit(onSubmit)();
                }}
                disabled={createPromptMutation.isPending}
              >
                <TestTube className="mr-2 h-4 w-4" />
                Save & Test
              </Button>
              <Button
                type="submit"
                onClick={() => setIsTestMode(false)}
                disabled={createPromptMutation.isPending}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Prompt
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
