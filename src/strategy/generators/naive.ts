import { getConfigInstance } from '../../config';
import { generateInitialTestCode } from '../../generate';
import { parseCode } from '../../utils';
import { BaseTestGenerator } from '../base';


export class NaiveTestGenerator extends BaseTestGenerator {
	async generateTest(): Promise<string> {
		const collectedData = await this.collectBasicInfo();
		if (!collectedData) return '';

		if (!await this.reportProgress(`[${getConfigInstance().generationType} mode] - generating initial test code`, 20)) {
			return '';
		}

		const testCode = await generateInitialTestCode(
			collectedData,
			this.languageId,
			this.logger
		);
		return parseCode(testCode);
	}
}
