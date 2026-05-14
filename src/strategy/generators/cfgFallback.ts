import { ConditionAnalysis } from '../../cfg/path';
import { getContextTermsFromAllTokens } from '../../tokenAnalyzer';
import { ContextSelector, ContextTerm } from '../../agents/contextSelector';
import { getConfigInstance } from '../../config';
import { getReferenceInfo } from '../../lsp/reference';
import { saveContextTerms } from '../../fileHandler';
import { LSPRAGTestGenerator } from './lsprag';

export class CFGFallbackTestGenerator extends LSPRAGTestGenerator {
    protected async collectInfo(
        _conditions: ConditionAnalysis[] = [],
        _functionInfo: Map<string, string> = new Map()
    ): Promise<ContextTerm[] | null> {
        let enrichedTerms: ContextTerm[] = [];
        const tokenCollectTime = Date.now();
        const contextSelector = await ContextSelector.create(this.document, this.functionSymbol);
        const tokens = await contextSelector.loadTokens();
        const identifiedTerms = await getContextTermsFromAllTokens(this.functionSymbol, tokens);
        this.logger.log("getContextTermsFromAllTokens", (Date.now() - tokenCollectTime).toString(), null, "");

        if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - gathering context`, 20)) {
            return null;
        }

        const retrieveTime = Date.now();
        enrichedTerms = await contextSelector.gatherContext(identifiedTerms, this.functionSymbol);
        const referenceStrings = await getReferenceInfo(this.document, this.functionSymbol.selectionRange, 60, false);
        const contextTermsForFunctionSymbol: ContextTerm = {
            name: this.functionSymbol.name,
            context: referenceStrings,
            need_example: true,
            hint: ["focal method"]
        };
        enrichedTerms.unshift(contextTermsForFunctionSymbol);
        this.logger.log("gatherContext", (Date.now() - retrieveTime).toString(), null, "");
        saveContextTerms(this.sourceCode, enrichedTerms, getConfigInstance().logSavePath!, this.fileName);
        return enrichedTerms;
    }
}
