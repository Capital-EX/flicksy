import './index.css';

import * as localForage from 'localforage';
import * as Pixi from 'pixi.js';
import * as JSZip from 'jszip';
import * as FileSaver from 'file-saver';
import * as uuid from 'uuid/v4';

import { base64ToUint8, uint8ToBase64 } from './Base64';

import DrawingBoardsPanel from './ui/DrawingBoardsPanel';
import { DrawingBoard } from './data/DrawingBoard';
import { MTexture } from './MTexture';
import { FlicksyProject, FlicksyProjectData } from './data/FlicksyProject';
import ScenesPanel from './ui/ScenesPanel';
import { Scene } from './data/Scene';

const pixi = new Pixi.Application(320, 240);
document.getElementById("root")!.appendChild(pixi.view);
pixi.start();

function rgb2num(r: number, g: number, b: number, a: number = 255)
{
  return ((a << 24) | (b << 16) | (g << 8) | (r)) >>> 0;
}

function randomInt(min: number, max: number){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

let brushColor = 0xFF00FF;
let brushSize = 1;

const white = 0xFFFFFFFF;

function doPalette()
{
    const palette = document.getElementById("palette")!;

    for (let i = 0; i < palette.children.length; ++i)
    {
        const cell = palette.children[i];
        const button = cell.children[0];
        let r = randomInt(0, 255);
        let g = randomInt(0, 255);
        let b = randomInt(0, 255);
        let c = rgb2num(r, g, b);

        if (i == 0)
        {
            r = 0;
            g = 0;
            b = 0;
            c = 0;
        }

        button.setAttribute("style", `background-color: rgb(${r},${g},${b});`);
        button.addEventListener("click", () => 
        {
            drawingBoardsPanel.erasing = (c == 0);
            brushColor = c;
            drawingBoardsPanel.brush = makeCircleBrush(brushSize, brushColor);
            drawingBoardsPanel.refresh();
        })
    }
}

function doBrushes()
{
  const brushes = document.getElementById("brushes")!;
  
  for (let i = 0; i < brushes.children.length; ++i)
  {
    const cell = brushes.children[i];
    const button = cell.children[0];
    button.addEventListener("click", () => 
    {
        brushSize = i + 1;
        drawingBoardsPanel.brush = makeCircleBrush(brushSize, brushColor);
        drawingBoardsPanel.refresh();
    });
  }
}

function makeCircleBrush(circumference: number, color: number): MTexture
{
    const brush = new MTexture(circumference, circumference);
    brush.circleTest(color == 0 ? white : color);

    return brush;
}

let project: FlicksyProject;
let drawingBoardsPanel: DrawingBoardsPanel;
let scenesPanel: ScenesPanel;

function refresh()
{
    drawingBoardsPanel.refresh();
    scenesPanel.refresh();
}

function parseProjectData(json: string): FlicksyProjectData
{
    const data = JSON.parse(json, (key, value) =>
    {
        if (value.hasOwnProperty("_type")
            && value._type == "Uint8ClampedArray")
        {
            return base64ToUint8(value.data);
        }

        return value;
    });

    return data;
}

function loadProject(data: FlicksyProjectData): FlicksyProject
{
    const project = new FlicksyProject();
    project.fromData(data);

    return project;
}

function setProject(p: FlicksyProject)
{
    project = p;

    drawingBoardsPanel.setProject(p);
    drawingBoardsPanel.setDrawingBoard(p.drawingBoards[0]);
    
    scenesPanel.setProject(p);
    scenesPanel.setScene(p.scenes[0]);

    p.flicksyVersion = "alpha-1";
    refresh();
}

function newProject(): FlicksyProject
{
    console.log("new project");

    const project = new FlicksyProject();
    project.name = "unnamed project";
    project.uuid = uuid();
    
    project.drawingBoards.push(new DrawingBoard());
    project.scenes.push(new Scene());

    return project;
}

function startupProject(): void
{
    fetch("./bundled-project.json")
    .then(response => response.text())
    .then(text =>
    {
        try
        {
            const data = parseProjectData(text);
            return data;
        }
        catch (e)
        {
            throw e; // Promise.reject("no project");
        }
    })
    .catch(reason => 
    {
        console.log(reason);

        return localForage.getItem<FlicksyProjectData>("v1-test");
    })
    .then(projectData => 
    {       
        if (projectData)
        {
            setProject(loadProject(projectData));
        }
        else
        {
            setProject(newProject());
        }
    });
}

function setup()
{
    doPalette();
    doBrushes();

    pixi.stage.scale = new Pixi.Point(8, 8);

    drawingBoardsPanel = new DrawingBoardsPanel(pixi);
    drawingBoardsPanel.brush = makeCircleBrush(1, 0xFFFFFF);

    drawingBoardsPanel.hide();

    scenesPanel = new ScenesPanel(pixi);

    const info = document.getElementById("info")! as HTMLDivElement;

    startupProject();

    function hideAll()
    {
        drawingBoardsPanel.hide();
        scenesPanel.hide();
        info.hidden = true;
    }

    hideAll();
    info.hidden = false;

    document.getElementById("info-tab-button")!.addEventListener("click", () =>
    {
        hideAll();
        info.hidden = false;
    });

    document.getElementById("drawing-tab-button")!.addEventListener("click", () =>
    {
        hideAll();
        drawingBoardsPanel.show();
    });

    document.getElementById("scene-tab-button")!.addEventListener("click", () =>
    {
        hideAll();
        scenesPanel.show();
    });

    document.getElementById("save")!.addEventListener("click", () =>
    {
        localForage.setItem("v1-test", project.toData());
    });

    document.getElementById("download")!.addEventListener("click", () =>
    {
        const zip = new JSZip();
        const drawings = zip.folder("drawings");
        
        for (let drawing of project.drawings)
        {
            const name = drawing.name + ".png";
            const url = drawing.texture.canvas.toDataURL("image/png");
            const data = url.substring(22);

            drawings.file(name, data, {base64: true});
        }

        zip.generateAsync({type: "blob"})
           .then(function(content) 
        {
            FileSaver.saveAs(content, "drawings.zip");
        });
    });

    const importButton = document.getElementById("import-data")! as HTMLInputElement;
    importButton.addEventListener("change", () =>
    {
        if (importButton.files && importButton.files[0])
        {
            const file = importButton.files[0];
            const reader = new FileReader();

            reader.onload = progress =>
            {
                const data = JSON.parse(reader.result as string, (key, value) =>
                {
                    if (value.hasOwnProperty("_type")
                     && value._type == "Uint8ClampedArray")
                    {
                        return base64ToUint8(value.data);
                    }

                    return value;
                });

                setProject(loadProject(data));
            };
            reader.readAsText(file);
        }
    });

    document.getElementById("download-data")!.addEventListener("click", () =>
    {
        const json = JSON.stringify(project.toData(), (key, value) =>
        {
            if (value instanceof Uint8ClampedArray)
            {
                return { "_type": "Uint8ClampedArray", "data": uint8ToBase64(value) }
            }
            else
            {
                return value;
            }
        });

        //postGist(json, url => console.log(url));

        const blob = new Blob([json], {type: "application/json"});
        FileSaver.saveAs(blob, "project.json");
    });

    document.getElementById("export-playable")!.addEventListener("click", () =>
    {
        const page = document.documentElement.cloneNode(true) as HTMLElement;
        const sidebar = page.querySelector<HTMLDivElement>("#sidebar")!;
        //sidebar.parentElement!.removeChild(sidebar);
        
        const script = page.getElementsByTagName("script")[0];
        const src = script.src;
        script.src = "./static/js/bundle.js";
        
        const zip = new JSZip();

        fetch("./asset-manifest.json")
        .then(response =>
        {
            zip.file("playable/index.html", page.outerHTML);
            zip.file("playable/asset-manifest.json", response.text());
            return fetch(src);
        })
        .then(response => 
        {
            zip.file(`playable/static/js/bundle.js`, response.text());
            return zip.generateAsync({type: "blob"});
        })
        .then(content => 
        {
            FileSaver.saveAs(content, "playable.zip");
        });
    });

    pixi.view.oncontextmenu = (e) => e.preventDefault();

    pixi.stage.on("pointermove", (event: Pixi.interaction.InteractionEvent) => 
    {
        drawingBoardsPanel.updateDragging(event);
        scenesPanel.updateDragging(event);
    });

    const resize = () =>
    {
      const w = document.documentElement.clientWidth;    
      const h = document.documentElement.clientHeight;    
      // this part resizes the canvas but keeps ratio the same    
      pixi.renderer.view.style.width = w + "px";    
      pixi.renderer.view.style.height = h + "px";    
      // this part adjusts the ratio:    
      pixi.renderer.resize(w,h);
    };

    pixi.stage.interactive = true;
    pixi.ticker.add(delta => resize());
}

setup();
