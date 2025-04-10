import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { TelemetryEvent, TelemetryConfig } from './types';
export class TelemetryService {
    private static instance: TelemetryService;
    private logger: vscode.TelemetryLogger;
    private config: TelemetryConfig;
    private serverUrl: string = 'http://localhost:3000/telemetry'; // Update with your server URL

    private constructor(context: vscode.ExtensionContext) {
        // Initialize config
        this.config = context.globalState.get('telemetryConfig') || {
            enabled: false,
            privacyNoticeShown: false,
            anonymousId: crypto.randomUUID(),
            serverUrl: this.serverUrl
        };

        // Save config
        context.globalState.update('telemetryConfig', this.config);

        // Create logger
        this.logger = vscode.env.createTelemetryLogger({
            sendEventData: async (eventName, data) => {
                await this.sendTelemetryData({
                    eventName,
                    data,
                    timestamp: new Date().toISOString(),
                    extensionVersion: vscode.extensions.getExtension('your-extension-id')?.packageJSON.version || 'unknown',
                    machineId: this.config.anonymousId
                });
            },
            sendErrorData: async (error, data) => {
                await this.sendTelemetryData({
                    eventName: 'error',
                    data: {
                        error: error instanceof Error ? error.message : error,
                        ...data
                    },
                    timestamp: new Date().toISOString(),
                    extensionVersion: vscode.extensions.getExtension('your-extension-id')?.packageJSON.version || 'unknown',
                    machineId: this.config.anonymousId
                });
            }
        });
    }

    public static initialize(context: vscode.ExtensionContext): TelemetryService {
        if (!TelemetryService.instance) {
            TelemetryService.instance = new TelemetryService(context);
        }
        return TelemetryService.instance;
    }

    private async sendTelemetryData(telemetryEvent: TelemetryEvent) {
        if (!this.config.enabled) {
            return;
        }

        try {
            const response = await fetch(this.config.serverUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(telemetryEvent)
            });

            if (!response.ok) {
                console.error('Failed to send telemetry:', await response.text());
            }
        } catch (error) {
            console.error('Error sending telemetry:', error);
        }
    }

    public async ensurePrivacyConsent(): Promise<boolean> {
        if (this.config.privacyNoticeShown) {
            return this.config.enabled;
        }

        const consent = await vscode.window.showInformationMessage(
            'This extension collects anonymous usage data to help improve its features. ' +
            'No personal information is collected. Do you consent to data collection?',
            'Yes, I consent',
            'No, disable telemetry'
        );

        this.config.privacyNoticeShown = true;
        this.config.enabled = consent === 'Yes, I consent';
        
        return this.config.enabled;
    }

    public logEvent(eventName: string, data: any) {
        this.logger.logUsage(eventName, data);
    }

    public logError(error: Error | string, data: any) {
        this.logger.logError(error as Error, data);
    }
}