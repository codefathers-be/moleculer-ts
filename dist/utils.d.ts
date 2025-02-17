export declare type GenerateBrokerOptions = {
    serviceTypesPattern: string;
    outputDir: string;
    generateActionsParamsAssert?: boolean;
    generateEventsParamsAssert?: boolean;
    isServiceName?: (name: string) => boolean;
};
export declare function generateBroker(options: GenerateBrokerOptions): Promise<void>;
