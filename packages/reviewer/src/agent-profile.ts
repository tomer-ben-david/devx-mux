export interface AgentRole {
  readonly id: string;
  readonly description: string;
  readonly instructions: string;
  readonly capabilities: {
    readonly readRepository: boolean;
    readonly inspectGitHistory: boolean;
    readonly modifyRepository: boolean;
  };
}

export interface AgentPersona {
  readonly id: string;
  readonly description: string;
  readonly instructions: string;
}

export interface ReviewProtocol {
  readonly id: string;
  readonly description: string;
  readonly instructions: string;
}

