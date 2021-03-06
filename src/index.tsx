import './index.css';
import { findProject, jsonToProject } from './tools/saving';
import * as utility from './tools/utility';
import ErrorPanel from './ui/ErrorPanel';
import FlicksyEditor from './ui/FlicksyEditor';
import { FontDataUniform, createContext2D, encodeTexture, TextureData, formats } from 'blitsy';
import { base64ToUint8 } from './tools/base64';

function reshapeFont(data: FontDataUniform): FontDataUniform
{   
    const side = Math.ceil(Math.sqrt(data.index.length));
    const [width, height] = [side * data.charWidth, side * data.charHeight];
    
    const context = createContext2D(width, height);
    context.globalAlpha = 1;
    context.fillStyle = '#FF00FF';
    context.fillRect(0, 0, 100, 100);

    const bytes = base64ToUint8(data.atlas.data);
    const pixels = new Uint8ClampedArray(data.atlas.width * data.atlas.height * 4);
    formats['M1'].decode(bytes, pixels);

    const glyph = context.createImageData(data.charWidth, data.charHeight);
    const glyphSize = data.charWidth * data.charHeight * 4;

    data.index.forEach((codepoint, index) => {
        const col = index % side;
        const row = Math.floor(index / side);
        const x = col * data.charWidth;
        const y = row * data.charHeight;
        glyph.data.set(pixels.slice(glyphSize * index, glyphSize * (index + 1)));
        context.putImageData(glyph, x, y);
    });

    document.getElementsByTagName("body")[0].appendChild(context.canvas);

    data.atlas = encodeTexture(context, 'M1') as TextureData;

    return data;
}

async function start()
{
    const error = new ErrorPanel();

    window.addEventListener("unhandledrejection", event =>
    {
        console.log((event as any).reason);
        error.show((event as any).reason);
    });

    window.addEventListener("error", event =>
    {
        const detail = `${event.message}\n${event.filename}:${event.lineno}`;

        console.log(detail);
        error.show(detail);
    });

    const editor = new FlicksyEditor(utility.getElement("sidebar"), 
                                     utility.getElement("root"),
                                     [160, 100]);

    // play embeded game or open editor
    const embed = document.getElementById("flicksy-data");

    if (embed)
    {
        editor.setProject(jsonToProject(embed.innerHTML));
        editor.enterPlayback(false);
    }
    else
    {
        const project = await findProject();
        editor.setProject(project);
        editor.enterEditor();
    }
}

start();
