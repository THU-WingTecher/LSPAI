
export interface ChatMessage {
    role: string;
    content: string;
}

export interface Prompt {
    messages: ChatMessage[];
}
