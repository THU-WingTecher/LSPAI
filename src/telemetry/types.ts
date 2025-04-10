export interface TelemetryEvent {
    eventName: string;
    data: any;
    timestamp: string;
    extensionVersion: string;
    machineId: string;
}

export interface TelemetryConfig {
    enabled: boolean;
    privacyNoticeShown: boolean;
    anonymousId: string;
    serverUrl: string;
}