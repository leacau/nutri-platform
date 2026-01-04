export type AppEnvironment = 'dev' | 'stage' | 'prod';

export type FirebaseClientConfig = {
	apiKey: string;
	authDomain: string;
	projectId: string;
};

export type ClientConfig = {
	env: AppEnvironment;
	apiBaseUrl: string;
	firebase: FirebaseClientConfig;
};

declare const __APP_CONFIG__: ClientConfig;

export const clientConfig: ClientConfig = __APP_CONFIG__;
export const APP_ENV = clientConfig.env;
export const API_BASE_URL = clientConfig.apiBaseUrl;
export const FIREBASE_CLIENT_CONFIG = clientConfig.firebase;
