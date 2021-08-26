/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import 'regenerator-runtime/runtime';
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";

const leftArrow = require("../assets/LeftArrow.png");
const leftArrowLight = require("../assets/LeftArrowLight.png");
const rightArrow = require("../assets/RightArrow.png");
const rightArrowLight = require("../assets/RightArrowLight.png");
const zoomPlus = require("../assets/zoomPlus.png");
const zoomMinus = require("../assets/zoomMinus.png");
const resetZoom = require("../assets/resetZoom.png");

import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.entry';

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;

import { VisualSettings } from "./settings";

export class Visual implements IVisual {
    private target: HTMLElement;
    private pdfContainer: HTMLElement;
    private context: CanvasRenderingContext2D;
    private canvas: HTMLCanvasElement
    private headerContainer: HTMLElement;
    
    private settings: VisualSettings;
    private base64encodedString: string  = "";
    private loadingTask: any = undefined;
    private renderTask: any = undefined;
    private pageNumber: number = 1;
    private numberOfPages: number = 1;
    private rightArrow: HTMLImageElement = new Image();
    private leftArrow: HTMLImageElement = new Image();
    private pageIndicator: Text;
    private pageIndicatorSpan: HTMLSpanElement;
    private zoomPlus: HTMLImageElement = new Image();
    private zoomMinus: HTMLImageElement = new Image();
    private zoomResetter: HTMLImageElement = new Image();
    private zoomIndicatorSpan: HTMLSpanElement;
    private zoomIndicator: Text;
    private headerIconHeight: number = 30; /* same height as in visual.less */
    private headerPadding: number = 4; /* same padding as in visual.less */
    private warningText: Text;
    private options: VisualUpdateOptions;
    private scrollOverflow: boolean = true;
    private headerIsPresentable: boolean = false;
    private zoomLevel: number = 1.0;
    
    constructor(options: VisualConstructorOptions) {

        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

        this.target = options.element;
        let self = this;
        
        this.createWarningTextNode();

        this.createHeaderContainer(self, options);
        this.createPdfContainer();

        this.toggleScrollOverflow();
        this.toggleHeaderVisibility();

        this.createZoomImages();
        
    }

    public update(options: VisualUpdateOptions) {
        
        this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
        this.options = options;

        let values = options.dataViews[0].table.rows;
        
        /* only one pdf must be selected */
        if(values.length == 1) {
            
            try {
                
                this.warningText.textContent = '';

                let newBase64String: string = values[0].toString();
                if(this.base64encodedString != newBase64String) this.pageNumber = 1;
                
                this.base64encodedString = newBase64String;

                let pdfAsArray = this.convertDataURIToBinary(this.base64encodedString);
                
                this.loadingTask = pdfjsLib.getDocument({data: pdfAsArray});
                
                this.loadingTask.promise.then((pdf) => {     
                    
                    this.numberOfPages = pdf.numPages;
                                
                    pdf.getPage(this.pageNumber).then((page) => {
                                                 
                        let scale: number = 3;
                        let viewport = page.getViewport({scale: scale});
                        
                        let viewportWidth: number = options.viewport.width;
                        let viewportHeight: number = options.viewport.height;

                        let scrollbarWidth: number = 18; //Fixed number for scroll bar width
                        let A4Proportion: number = 1.414; //Fixed number for A4 proportion
                        
                        this.pdfContainer.style.width = viewportWidth + 'px';
                        this.pdfContainer.style.height =
                           viewportHeight
                              - (this.settings.dataPoint.showHeader == true ? 
                                2 * this.headerPadding + this.headerIconHeight : 
                                0) + 'px';
                        
                        this.canvas.height = viewport.height;
                        this.canvas.width = viewport.width;
                        this.canvas.style.width = viewportWidth * this.zoomLevel - scrollbarWidth + 'px'; // - scrollbarWidth
                        this.canvas.style.height = viewportWidth * A4Proportion * this.zoomLevel + 'px';
                        
                        let renderContext = {
                            canvasContext: this.context,
                            viewport: viewport
                        };
                        
                        /* cancel and destroy render in case new pdf is loaded before previous render is finished */
                        if(this.renderTask !== undefined) { 
                            this.renderTask._internalRenderTask.cancel();
                        }

                        this.renderTask = page.render(renderContext);
                        this.renderTask.promise.then(() => {
                            
                            this.evaluateArrowImages();
                            
                            this.headerIsPresentable = true;
                            this.scrollOverflow = this.settings.dataPoint.scrollOverflow;
                            this.toggleHeaderVisibility();
                            this.toggleScrollOverflow();

                            this.pageIndicator.textContent = this.pageNumber + " / " + this.numberOfPages;
                            this.zoomIndicator.textContent = this.zoomLevel * 100 + '%';
                            
                        });
                    
                    });
    
                }, (reason) => {
                    console.error(reason);
                });
                
            }
            catch (error) {
                console.error(error);
            }      
        }
        /* Handle if more than one pdf is selected */
        else {
            
            this.base64encodedString = "(dummy)";
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.headerIsPresentable = false;
            this.scrollOverflow = false;
            this.toggleHeaderVisibility();
            this.toggleScrollOverflow();

            this.warningText.textContent = 'The visual must be filtered to one document in order to be displayed';

        }
        
        return;
    }

    public createHeaderContainer(self, options: VisualConstructorOptions) {

        this.headerContainer = document.createElement('div');
        let zoom_increment_decrement: number = 0.25;
        let uneven: number = 0.01;

        /* Arrows */
        this.leftArrow.addEventListener('click', function(e) {
            self.pageNumber <= 1 ? self.pageNumber = 1 : self.pageNumber--;
            self.evaluateArrowImages();
            self.update(self.options);
        });
        
        this.rightArrow.addEventListener('click', function(e) {
            self.pageNumber >= self.numberOfPages ? self.numberOfPages = self.numberOfPages : self.pageNumber++;
            self.evaluateArrowImages();
            self.update(self.options);
        });

        /* Page Indicator */
        this.pageIndicatorSpan = document.createElement("span");
        this.pageIndicator = document.createTextNode('');
        this.pageIndicatorSpan.appendChild(this.pageIndicator);

        /* Zoom buttons 
        /  Uneven numbers used in check to guard against trailing decimals
        */
        this.zoomPlus.addEventListener('click', function(e) {
            self.zoomLevel >= (3.00 - uneven) ? self.zoomLevel = 3 : self.zoomLevel += zoom_increment_decrement;
            self.update(self.options);
        });

        this.zoomMinus.addEventListener('click', function(e) {
            self.zoomLevel <= (0.25 + uneven) ? self.zoomLevel = 0.25 :  self.zoomLevel-=zoom_increment_decrement;
            self.update(self.options);
        });

        /* Zoom reset */
        this.zoomResetter.addEventListener('click', function(e) {
            self.zoomLevel = 1;
            self.update(self.options);
        });
        
        /* Zoom indicator */
        this.zoomIndicatorSpan = document.createElement('span');
        this.zoomIndicator = document.createTextNode('');
        this.zoomIndicatorSpan.appendChild(this.zoomIndicator);
        
        /* Append to header */
        this.headerContainer.appendChild(this.leftArrow);
        this.headerContainer.appendChild(this.rightArrow);
        
        this.headerContainer.appendChild(this.pageIndicatorSpan);

        this.headerContainer.appendChild(this.zoomPlus);
        this.headerContainer.appendChild(this.zoomMinus);

        this.headerContainer.appendChild(this.zoomResetter);
        this.headerContainer.appendChild(this.zoomIndicatorSpan);

        this.zoomPlus.className = "zoom-button";
        this.zoomMinus.className = "zoom-button";
        this.zoomPlus.id = "zoom-plus";
        this.zoomMinus.id = "zoom-minus";
        this.zoomResetter.id = "zoom-resetter";
        this.zoomIndicatorSpan.id = "zoom-indicator-span";

        /* Hide header initially */
        this.headerContainer.hidden = true;
        this.target.appendChild(this.headerContainer);

        return;
    }

    public createPdfContainer() {

        this.pdfContainer = document.createElement("div");
        this.pdfContainer.id = "pdf-container";
        this.canvas = this.pdfContainer.appendChild(<HTMLCanvasElement>document.createElement('canvas'));
        this.canvas.id = "pdf-canvas";
        this.context = this.canvas.getContext('2d');
        
        this.target.appendChild(this.pdfContainer);

        return;
    }

    public toggleScrollOverflow() {
        
        this.pdfContainer.style.overflowX = 'hidden'
        this.pdfContainer.style.overflowY = 'hidden'
        if(this.scrollOverflow == true) {
            this.pdfContainer.style.overflowY =
                this.pdfContainer.clientHeight <= this.canvas.clientHeight ?
                'scroll' :
                'hidden';
            this.pdfContainer.style.overflowX =
                this.pdfContainer.clientWidth <= this.canvas.clientWidth ?
                'scroll' :
                'hidden';
        }

        return;
    }

    public toggleHeaderVisibility() {

        this.headerContainer.hidden = 
            this.headerIsPresentable == true && this.settings.dataPoint.showHeader == true ?
            false :
            true;

        return;
    }

    public createZoomImages() {

        this.zoomPlus.src = zoomPlus;
        this.zoomMinus.src = zoomMinus;
        this.zoomResetter.src = resetZoom;

        return;
    }

    public createWarningTextNode() {

        this.warningText = document.createTextNode('');

        this.target.appendChild(this.warningText);

        return;
    }

    public evaluateArrowImages() {

        this.leftArrow.src = this.pageNumber <= 1 || this.numberOfPages <= 1 ?
            leftArrowLight :
            leftArrow; 

        this.rightArrow.src = this.pageNumber >= this.numberOfPages || this.numberOfPages <= 1 ?
            rightArrowLight :
            rightArrow; 

        return;
    }

    public convertDataURIToBinary (dataURI: string) {

        let BASE64_MARKER = ';base64,';
        let pdfAsDataUri = "data:application/pdf;base64," + dataURI;
        let base64Index = pdfAsDataUri.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
        let base64 = pdfAsDataUri.substring(base64Index);
        let raw = Buffer.from(base64,'base64').toString('binary');
        let rawLength = raw.length;
        let array = new Uint8Array(new ArrayBuffer(rawLength));

        for(let i = 0; i < rawLength; i++) {
            array[i] = raw.charCodeAt(i);
        }
        return array;
    }

    private static parseSettings(dataView: DataView): VisualSettings {
        return VisualSettings.parse(dataView) as VisualSettings;
    }

    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
        return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
    }

}