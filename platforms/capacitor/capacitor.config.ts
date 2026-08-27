import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'us.indienodes.app',
	appName: 'IndieNodes',
	webDir: '../../build',
	backgroundColor: '#0f1420',
	android: {
		path: 'android'
	}
};

export default config;
