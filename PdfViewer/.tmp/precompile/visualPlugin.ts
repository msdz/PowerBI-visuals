import { Visual } from "../../src/visual";
import powerbiVisualsApi from "powerbi-visuals-api";
import IVisualPlugin = powerbiVisualsApi.visuals.plugins.IVisualPlugin;
import VisualConstructorOptions = powerbiVisualsApi.extensibility.visual.VisualConstructorOptions;
var powerbiKey: any = "powerbi";
var powerbi: any = window[powerbiKey];

var pdfViewer392A657C115F4015AD64793E71199A8B: IVisualPlugin = {
    name: 'pdfViewer392A657C115F4015AD64793E71199A8B',
    displayName: 'Pdf Viewer',
    class: 'Visual',
    apiVersion: '2.6.0',
    create: (options: VisualConstructorOptions) => {
        if (Visual) {
            return new Visual(options);
        }

        throw 'Visual instance not found';
    },
    custom: true
};

if (typeof powerbi !== "undefined") {
    powerbi.visuals = powerbi.visuals || {};
    powerbi.visuals.plugins = powerbi.visuals.plugins || {};
    powerbi.visuals.plugins["pdfViewer392A657C115F4015AD64793E71199A8B"] = pdfViewer392A657C115F4015AD64793E71199A8B;
}

export default pdfViewer392A657C115F4015AD64793E71199A8B;