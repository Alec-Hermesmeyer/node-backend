export interface ContractSection {
    sectionTitle: string;
    content: string;
  }
  
  export interface ContractDocument {
    title: string;
    sections: ContractSection[];
  }
  
  export interface FinancialProvisions {
    [key: string]: string | string[];
  }
  
  export interface RiskAllocation {
    [key: string]: string;
  }
  
  export interface ContractAnalysis {
    contractName?: string;
    contractDocuments?: ContractDocument[];
    financialProvisions?: FinancialProvisions;
    riskAllocation?: RiskAllocation;
    complianceRequirements?: string[] | string;
    summary?: string;
  }
  
  export interface ResponseData {
    message?: {
      content: string;
    };
    contractAnalysis?: ContractAnalysis;
    context?: {
      followup_questions?: string[];
      [key: string]: any;
    };
  }
  
  export interface ChatRequest {
    messages: any[];
    sessionId?: string;
    temperature?: number;
    seed?: string;
    stream?: boolean;
    suggestFollowUpQuestions?: boolean;
    promptTemplate?: string;
    minSearchScore?: number;
    minRerankerScore?: number;
    includeCategory?: string;
    excludeCategory?: string;
    useSemanticRanker?: boolean;
    useSemanticCaptions?: boolean;
    retrievalMode?: string;
    contractAnalysis?: boolean;
    contractName?: string;
    analysisPrompt?: string;
  }