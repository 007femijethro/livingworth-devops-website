import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.livingworthacademy.app',
  appName: 'Livingworth Academy',
  webDir: 'dist',
  android: { allowMixedContent: false },
  plugins: { LiveUpdate: {
    publicKey: "-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAnti14Kk1WqXk4O6JwM7p\nJhQ5zaQLee7BHngP2lW1wXneYaeyxGUmeTjcNEb9pi63nQTxIFJPqek8/h40/Khw\nwYWbXPplA9lTy1MRvaon3jsfF6jba1vKYfHOandWFFZg86A0xqFehPHwN7X0WTkQ\n2OfSQFPCaIa/+//sxPROvbXxqvIOQJuy/XXttOS9gnq1wpDLwsv3O/Xd0djNfyup\nmd/ErvwpIjg2iwCcJa6wXe31572jfYxYrp5FxLKJLOPcReJPtPDIW5Ip/DoRQF9h\nS4ZToI2IGJvikSXFgyLHVtQ5qpY/UYGdNiz31qNn2jpChMkKDlgRiUsOol4pSCN8\nvk7msvbJqiuvW19GuvtBTs5aUJHyAZf9104MhS3NyWQuHABwABKamBv5AUvILv4F\nCJZwn1P69Oxu65g1S2SMFjaEyCivbppHM6Vuz9oCDd4Du6UCIhn3bN5G+2ZMwsV2\n01jZ7UQM/bJd/AOgL/QBCJv6DNnZ2H5V88By/kRFwFA1AgMBAAE=\n-----END PUBLIC KEY-----\n",
    readyTimeout: 15000,
    autoBlockRolledBackBundles: true,
    autoDeleteBundles: true,
    autoUpdateStrategy: 'none',
  } },
};
export default config;
