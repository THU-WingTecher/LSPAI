
export interface ExpLogs {
    llmInfo : LLMLogs | null;
    process : string;
    time : string;
    method : string;
    fileName : string;
    function : string;
    errMsag : string;
}

export interface LLMLogs {
    tokenUsage : string;
    result : string;
    prompt : string;
    model : string;
}