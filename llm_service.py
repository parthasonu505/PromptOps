from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
import time
import asyncio
from cryptography.fernet import Fernet
import os
import base64
from openai import OpenAI
from pydantic import BaseModel


class LLMResponse(BaseModel):
    response: str
    response_time: float
    tokens: Dict[str, int]
    cost: float  # in cents
    model_id: str
    success: bool
    error: Optional[str] = None


class ILLMProvider(ABC):
    """Base interface for LLM providers."""
    
    @abstractmethod
    async def send_prompt(
        self, 
        prompt: str, 
        model_id: str, 
        api_key: str, 
        options: Optional[Dict[str, Any]] = None
    ) -> LLMResponse:
        pass
    
    @abstractmethod
    def get_models(self) -> List[Dict[str, Any]]:
        pass
    
    @property
    @abstractmethod
    def name(self) -> str:
        pass


class OpenAIProvider(ILLMProvider):
    """OpenAI API provider implementation."""
    
    @property
    def name(self) -> str:
        return "openai"
    
    def get_models(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "gpt-4o",
                "name": "GPT-4o",
                "capabilities": ["text", "vision", "function-calling"],
                "contextWindow": 128000,
                "inputCostPer1k": 2.50,
                "outputCostPer1k": 10.00
            },
            {
                "id": "gpt-4o-mini",
                "name": "GPT-4o Mini", 
                "capabilities": ["text", "vision", "function-calling"],
                "contextWindow": 128000,
                "inputCostPer1k": 0.15,
                "outputCostPer1k": 0.60
            },
            {
                "id": "gpt-3.5-turbo",
                "name": "GPT-3.5 Turbo",
                "capabilities": ["text", "function-calling"],
                "contextWindow": 16385,
                "inputCostPer1k": 0.50,
                "outputCostPer1k": 1.50
            }
        ]
    
    async def send_prompt(
        self, 
        prompt: str, 
        model_id: str, 
        api_key: str, 
        options: Optional[Dict[str, Any]] = None
    ) -> LLMResponse:
        start_time = time.time()
        
        try:
            client = OpenAI(api_key=api_key)
            
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=model_id,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=options.get("max_tokens", 1000) if options else 1000,
                temperature=options.get("temperature", 0.7) if options else 0.7,
            )
            
            response_time = time.time() - start_time
            
            # Calculate costs (rough estimates)
            input_tokens = response.usage.prompt_tokens if response.usage else 0
            output_tokens = response.usage.completion_tokens if response.usage else 0
            
            model_info = next((m for m in self.get_models() if m["id"] == model_id), None)
            if model_info:
                input_cost = (input_tokens / 1000) * model_info["inputCostPer1k"]
                output_cost = (output_tokens / 1000) * model_info["outputCostPer1k"] 
                total_cost = input_cost + output_cost
            else:
                total_cost = 0
            
            return LLMResponse(
                response=response.choices[0].message.content or "",
                response_time=response_time,
                tokens={"input": input_tokens, "output": output_tokens},
                cost=total_cost,
                model_id=model_id,
                success=True
            )
            
        except Exception as e:
            response_time = time.time() - start_time
            return LLMResponse(
                response="",
                response_time=response_time,
                tokens={"input": 0, "output": 0},
                cost=0,
                model_id=model_id,
                success=False,
                error=str(e)
            )


class AnthropicProvider(ILLMProvider):
    """Anthropic API provider implementation."""
    
    @property
    def name(self) -> str:
        return "anthropic"
    
    def get_models(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "claude-sonnet-4-20250514",
                "name": "Claude 4.0 Sonnet",
                "capabilities": ["text", "vision", "document-analysis"],
                "contextWindow": 200000,
                "inputCostPer1k": 3.00,
                "outputCostPer1k": 15.00
            },
            {
                "id": "claude-3-7-sonnet-20250219",
                "name": "Claude 3.7 Sonnet",
                "capabilities": ["text", "vision", "document-analysis"],
                "contextWindow": 200000,
                "inputCostPer1k": 3.00,
                "outputCostPer1k": 15.00
            },
            {
                "id": "claude-3-5-haiku-20241022",
                "name": "Claude 3.5 Haiku",
                "capabilities": ["text", "vision"],
                "contextWindow": 200000,
                "inputCostPer1k": 1.00,
                "outputCostPer1k": 5.00
            }
        ]
    
    async def send_prompt(
        self, 
        prompt: str, 
        model_id: str, 
        api_key: str, 
        options: Optional[Dict[str, Any]] = None
    ) -> LLMResponse:
        start_time = time.time()
        
        # Placeholder implementation - would need anthropic package
        # For now, return a mock response
        response_time = time.time() - start_time
        
        return LLMResponse(
            response="Anthropic integration placeholder - install anthropic package",
            response_time=response_time,
            tokens={"input": 10, "output": 15},
            cost=0.05,
            model_id=model_id,
            success=False,
            error="Anthropic provider not fully implemented"
        )


class GoogleProvider(ILLMProvider):
    """Google AI provider implementation."""
    
    @property
    def name(self) -> str:
        return "google"
    
    def get_models(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "gemini-2.5-flash",
                "name": "Gemini 2.5 Flash",
                "capabilities": ["text", "vision", "audio", "video"],
                "contextWindow": 1048576,
                "inputCostPer1k": 0.075,
                "outputCostPer1k": 0.30
            },
            {
                "id": "gemini-2.5-pro",
                "name": "Gemini 2.5 Pro",
                "capabilities": ["text", "vision", "audio", "video", "code-execution"],
                "contextWindow": 2097152,
                "inputCostPer1k": 1.25,
                "outputCostPer1k": 5.00
            }
        ]
    
    async def send_prompt(
        self, 
        prompt: str, 
        model_id: str, 
        api_key: str, 
        options: Optional[Dict[str, Any]] = None
    ) -> LLMResponse:
        start_time = time.time()
        
        # Placeholder implementation - would need google-generativeai package
        response_time = time.time() - start_time
        
        return LLMResponse(
            response="Google AI integration placeholder - install google-generativeai package",
            response_time=response_time,
            tokens={"input": 10, "output": 15},
            cost=0.02,
            model_id=model_id,
            success=False,
            error="Google AI provider not fully implemented"
        )


class LLMService:
    """Main service for managing LLM providers and API key encryption."""
    
    def __init__(self):
        self.providers: Dict[str, ILLMProvider] = {
            "openai": OpenAIProvider(),
            "anthropic": AnthropicProvider(),
            "google": GoogleProvider()
        }
        
        # Initialize encryption key
        encryption_key = os.getenv("ENCRYPTION_KEY")
        if not encryption_key:
            # Generate a new key if none exists (for development)
            encryption_key = base64.urlsafe_b64encode(os.urandom(32)).decode()
            
        self.cipher_suite = Fernet(encryption_key.encode() if len(encryption_key) == 44 else base64.urlsafe_b64encode(encryption_key[:32].encode()))
    
    def encrypt_api_key(self, api_key: str) -> str:
        """Encrypt an API key for secure storage."""
        return self.cipher_suite.encrypt(api_key.encode()).decode()
    
    def decrypt_api_key(self, encrypted_key: str) -> str:
        """Decrypt an API key for use."""
        return self.cipher_suite.decrypt(encrypted_key.encode()).decode()
    
    def get_providers(self) -> List[Dict[str, Any]]:
        """Get list of available providers with their models."""
        providers = []
        for provider_name, provider in self.providers.items():
            providers.append({
                "name": provider_name,
                "display_name": self._get_display_name(provider_name),
                "base_url": self._get_base_url(provider_name),
                "models": provider.get_models(),
                "api_key_required": True
            })
        return providers
    
    async def send_prompt(
        self, 
        provider_name: str, 
        model_id: str, 
        prompt: str, 
        encrypted_api_key: str,
        options: Optional[Dict[str, Any]] = None
    ) -> LLMResponse:
        """Send a prompt to a specific provider and model."""
        provider = self.providers.get(provider_name)
        if not provider:
            return LLMResponse(
                response="",
                response_time=0,
                tokens={"input": 0, "output": 0},
                cost=0,
                model_id=model_id,
                success=False,
                error=f"Provider {provider_name} not found"
            )
        
        try:
            api_key = self.decrypt_api_key(encrypted_api_key)
            return await provider.send_prompt(prompt, model_id, api_key, options)
        except Exception as e:
            return LLMResponse(
                response="",
                response_time=0,
                tokens={"input": 0, "output": 0},
                cost=0,
                model_id=model_id,
                success=False,
                error=f"Failed to decrypt API key or send prompt: {str(e)}"
            )
    
    async def compare_prompts(
        self, 
        prompt: str, 
        models: List[Dict[str, str]],  # [{"provider": "openai", "model": "gpt-4o", "api_key": "encrypted_key"}]
        options: Optional[Dict[str, Any]] = None
    ) -> List[LLMResponse]:
        """Send a prompt to multiple models for comparison."""
        tasks = []
        for model_config in models:
            task = self.send_prompt(
                model_config["provider"],
                model_config["model"],
                prompt,
                model_config["api_key"],
                options
            )
            tasks.append(task)
        
        return await asyncio.gather(*tasks)
    
    def _get_display_name(self, provider_name: str) -> str:
        """Get display name for provider."""
        display_names = {
            "openai": "OpenAI",
            "anthropic": "Anthropic", 
            "google": "Google AI"
        }
        return display_names.get(provider_name, provider_name.title())
    
    def _get_base_url(self, provider_name: str) -> str:
        """Get base URL for provider."""
        base_urls = {
            "openai": "https://api.openai.com/v1",
            "anthropic": "https://api.anthropic.com",
            "google": "https://generativelanguage.googleapis.com/v1beta"
        }
        return base_urls.get(provider_name, "")


# Global service instance
llm_service = LLMService()