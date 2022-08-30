
// Some constants
const EarthRadiusEquator = 6378.137;
const EarthRadiusPolar = 6356.752;
const EarthSkew = EarthRadiusPolar / EarthRadiusEquator; // 0.997; // earth skew
const TileSize = 256;
const HiddenCanvasTiles = 7;
const MIN_LATITUDE = -85.0511;
const MAX_LATITUDE = 85.0511;
const LATITUDE_TURN = 180.0;
const MIN_LONGITUDE = -180.0;
const MAX_LONGITUDE = 180.0;
const LONGITUDE_TURN = 360.0;

const CONFIG = {
    loadTexture: true,
    updateBuffer: false,

    eyePosition: 20000,
    eyeAngle: 0,
    eyeLat: 52.37313,
    eyeLon: 4.89875,
    rotLatSpeed: 0,
    rotLatDir: 1,
    rotLonSpeed: 0,

    textureTilesZoom: 3,
    textureTilesBbox: [0, 0, HiddenCanvasTiles, HiddenCanvasTiles],
    vertexZoom: 5,
    // defaultURL: 'https://tile.osmand.net/hd',
    defaultURL: 'https://tile.openstreetmap.org',
    
    drawMode: 'TRIANGLES',
    
    fieldOfView: (30 * Math.PI) / 180, // in radians
    zNear: 0.0001,
    zFar: 100
};

main();

// input: h in [0,360] and s,v in [0,1] - output: r,g,b in [0,1]
function hsv2rgb(h, s, v, a) {
    let f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
    return [f(5), f(3), f(1), a];
}   


function checkLongitude(longitude) {
    if (longitude >= MIN_LONGITUDE && longitude <= MAX_LONGITUDE) {
        return longitude;
    }
    while (longitude <= MIN_LONGITUDE || longitude > MAX_LONGITUDE) {
        if (longitude < 0) {
            longitude += LONGITUDE_TURN;
        } else {
            longitude -= LONGITUDE_TURN;
        }
    }
    return longitude;
}

function checkLatitude(latitude) {
    if (latitude >= MIN_LATITUDE && latitude <= MAX_LATITUDE) {
        return latitude;
    }
    while (latitude < -90 || latitude > 90) {
        if (latitude < 0) {
            latitude += LATITUDE_TURN;
        } else {
            latitude -= LATITUDE_TURN;
        }
    }
    if (latitude < MIN_LATITUDE) {
        return MIN_LATITUDE;
    } else if (latitude > MAX_LATITUDE) {
        return MAX_LATITUDE;
    }
    return latitude;
}

function getTileNumberY(zoom, latitude) {
    latitude = checkLatitude(latitude) / 180.0 * Math.PI;
	let eval = Math.log(Math.tan(latitude) + 1 / Math.cos(latitude));
    return (1 - eval / Math.PI) / 2 * getPowZoom(zoom);
}

function getTileNumberX(zoom, longitude) {
    longitude = checkLongitude(longitude);
	const powZoom = getPowZoom(zoom);
    let dz = (longitude + 180.0) /360.0 * powZoom;
    if (dz >= powZoom) {
        return powZoom - 0.01;
    }
    return dz;
}

function getLatitudeFromTile(zoom, y) {
    let sign = y < 0 ? -1 : 1;
    return Math.atan(sign * Math.sinh(Math.PI * (1 - 2 * y / getPowZoom(zoom)))) * 180 / Math.PI;
}
function getLongitudeFromTile(zoom, x) {
    return x / getPowZoom(zoom) * 360.0 - 180.0;
}

function getPowZoom(zoom) {
    if (zoom >= 0 && zoom - Math.floor(zoom) < 0.001) {
        return 1 << parseInt(zoom);
    } else {
        return Math.pow(2, zoom);
    }
}

// Start here
function main() {
    const canvas = document.querySelector("#glcanvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    // If we don't have a GL context, give up now
    if (!gl) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
    }

    // Vertex shader program
    const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec4 aVertexColor;
    attribute vec2 aTextureCoord;

    uniform mat4 uProjectionMatrix;
    uniform mat4 uRotationMatrix;
    varying lowp vec4 vColor;
    varying highp vec2 vTextureCoord;

    void main(void) {
      gl_Position = uProjectionMatrix * uRotationMatrix * aVertexPosition;
      vColor = aVertexColor;
      vTextureCoord = aTextureCoord;
    }
  `;

    // Fragment shader program
    const fsSource = `
    varying lowp vec4 vColor;
    varying highp vec2 vTextureCoord;
    uniform sampler2D uSampler;

    void main(void) {
    //   gl_FragColor = vColor; // random color 
       gl_FragColor = texture2D(uSampler, vTextureCoord); // tiles
    }
  `;

    // Initialize a shader program; this is where all the lighting
    // for the vertices and so forth is established.
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

    // Collect all the info needed to use the shader program.
    // Look up which attributes our shader program is using
    // for aVertexPosition, aVertexColor and also
    // look up uniform locations.
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, "aVertexPosition"),
            vertexColor: gl.getAttribLocation(shaderProgram, "aVertexColor"),
            textureCoord: gl.getAttribLocation(shaderProgram, "aTextureCoord"),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(shaderProgram, "uProjectionMatrix"),
            rotationMatrix: gl.getUniformLocation(shaderProgram, "uRotationMatrix"),
            uSampler: gl.getUniformLocation(shaderProgram, "uSampler"),
        },
    };
    addListeners();
    // Here's where we call the routine that builds all the
    // objects we'll be drawing.
    var buffers = initBuffers(gl);
    // https://tile.openstreetmap.org/3/4/2.png
    // Browsers copy pixels from the loaded image in top-to-bottom order —
    // from the top-left corner; but WebGL wants the pixels in bottom-to-top
    // order — starting from the bottom-left corner. So in order to prevent
    // the resulting image texture from having the wrong orientation when
    // rendered, we need to make the following call, to cause the pixels to
    // be flipped into the bottom-to-top order that WebGL expects.

    
    var then = 0;
    // Draw the scene repeatedly
    var texture;
    function render(now) {
        if (CONFIG.loadTexture) {
            texture = loadTilesTexture(gl);
            CONFIG.loadTexture = false;
            buffers = initBuffers(gl);
            CONFIG.updateBuffer = false;
        }
        if (CONFIG.updateBuffer) {
            buffers = initBuffers(gl);
            CONFIG.updateBuffer = false;
        }
        const deltaTime = now - then;
        then = now;
        drawScene(gl, programInfo, buffers, deltaTime / 1000.0, texture);
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}


// Initialize the buffers we'll need.
function initBuffers(gl) {
    // Now set up the colors for the faces. We'll use solid colors
    // for each face.
    const z = CONFIG.vertexZoom;
    const vertAllTiles = 1 << CONFIG.vertexZoom;
    const texAllTiles = 1 << CONFIG.textureTilesZoom;
    const faceColors = [];
    for (var cind = 0; cind < vertAllTiles * 2; cind++) {
        faceColors.push(hsv2rgb((360 / (vertAllTiles * 2)) * cind, 0.9, 0.9, 1));
    }
    var ind = 0;
    var vertCount = 0;
    
    const rotAngle = 2 *  Math.PI / vertAllTiles; // in radians
    const cxTile = Math.floor(getTileNumberX(z, CONFIG.eyeLon));
    const cyTile = Math.floor(getTileNumberY(z, CONFIG.eyeLat));
    const cRad = Math.max(1 << (z - 2), 2);
    const noncStep = Math.max(1 << (z - 4), 1);
    let xWidth = 1;
    let yWidth = 1;
    
    const texStepX = 1 / (CONFIG.textureTilesBbox[2] + 1);
    const texStepY = 1 / (CONFIG.textureTilesBbox[3] + 1);
    const texOriginX = 1.0 * CONFIG.textureTilesBbox[0] / texAllTiles * vertAllTiles;
    const texOriginY = 1.0 * CONFIG.textureTilesBbox[1] / texAllTiles * vertAllTiles;
    const texTilesWidth = 1.0 * (CONFIG.textureTilesBbox[2] + 1) / texAllTiles * vertAllTiles;
    const texTilesHeight = 1.0 * (CONFIG.textureTilesBbox[3] + 1) / texAllTiles * vertAllTiles;
    let loopLength = 0;
    for (var xTile = 0; xTile < vertAllTiles; xTile += xWidth) {
        xWidth = Math.abs(xTile - cxTile) < cRad ? 1 : noncStep;
        loopLength ++;
    }
    // Now create an array of positions for the cube.
    let colors = [];
    let positions = [];
    let indices = []
    let textureCoordinates = [];
    let arrInd = 0;
    for (var xTile = 0; xTile < vertAllTiles; xTile += xWidth) {
        xWidth = Math.abs(xTile - cxTile) < cRad ? 1 : noncStep;
        for (var yTile = 0; yTile < vertAllTiles; yTile += yWidth) {
            yWidth = Math.abs(yTile - cyTile) < cRad ? 1 : noncStep;
            // GEO: geolatitude = 90 - lat, geolongitude = lon - 180
            // const latt = EarthDelta + j * rotAngleLat;
            // const latb = EarthDelta + (j + 1) * rotAngleLat;
            // const lonl = i * rotAngle;
            // const lonr = (i + 1) * rotAngle;
            const latt = Math.PI / 2 - getLatitudeFromTile(z, yTile) / (180 / Math.PI);
            const latb = Math.PI / 2 - getLatitudeFromTile(z, yTile + yWidth) / (180 / Math.PI);
            const lonl = getLongitudeFromTile(z, xTile) / (180 / Math.PI) + Math.PI;
            const lonr = getLongitudeFromTile(z, xTile + xWidth) / (180 / Math.PI) + Math.PI;
            positions.push(
                Math.sin(lonl) * Math.sin(latt), EarthSkew * Math.cos(latt), Math.cos(lonl) * Math.sin(latt),
                Math.sin(lonl) * Math.sin(latb), EarthSkew * Math.cos(latb), Math.cos(lonl) * Math.sin(latb),
                Math.sin(lonr) * Math.sin(latt), EarthSkew * Math.cos(latt), Math.cos(lonr) * Math.sin(latt),
                Math.sin(lonr) * Math.sin(latb), EarthSkew * Math.cos(latb), Math.cos(lonr) * Math.sin(latb),
            );
            
            var leftTex = (xTile - texOriginX) / texTilesWidth + texStepX;
            var rightTex = (xTile + xWidth - texOriginX) / texTilesWidth + texStepX;
            if (leftTex < 0 || rightTex > 1) {
                leftTex = 0; rightTex = Math.min(texStepX, texStepX * texAllTiles / vertAllTiles);
            }
            var topTex = (yTile - texOriginY) / texTilesHeight + texStepY;
            var bottomTex = (yTile + yWidth - texOriginY ) / texTilesHeight + texStepY;
            if (topTex < 0 || bottomTex > 1) {
                topTex = 0; bottomTex = Math.min(texStepY * texAllTiles / vertAllTiles, texStepY);
            }
            textureCoordinates.push( 
                // 0, 0, step * i, 0, step * i, step * j, 0, step * j,
                leftTex, topTex, leftTex, bottomTex, 
                rightTex, topTex, rightTex, bottomTex
            );
            indices.push(ind, ind + 1, ind + 2, ind + 2, ind + 1, ind + 3);
            ind += 4;
            vertCount += 6;
            const c = faceColors[((xTile * vertAllTiles + yTile) * 7) % faceColors.length];
            // Repeat each color four times for the four vertices of the face
            colors.push(c[0], c[1], c[2], c[3]);
            colors.push(c[0], c[1], c[2], c[3]);
            colors.push(c[0], c[1], c[2], c[3]);
            colors.push(c[0], c[1], c[2], c[3]);
            arrInd++;
        }
    }
    for (var yTile = -1; yTile <= 1; yTile += 2) {
        for (var xTile = 0; xTile < vertAllTiles; xTile += xWidth) {
            xWidth = Math.abs(xTile - cxTile) < cRad ? 1 : noncStep;
            var lonl = xTile * rotAngle;
            var lonr = (xTile + xWidth) * rotAngle;
            // let topAngle = EarthDelta;
            let topAngle = Math.PI / 2 - getLatitudeFromTile(z, 0) / (180 / Math.PI);
            positions.push(
                0, yTile * EarthSkew, 0,
                Math.sin(lonl) * Math.sin(topAngle), EarthSkew * yTile * Math.cos(topAngle), Math.cos(lonl) * Math.sin(topAngle),
                Math.sin(lonr) * Math.sin(topAngle), EarthSkew * yTile * Math.cos(topAngle), Math.cos(lonr) * Math.sin(topAngle)
            );
            indices.push(ind, ind + 1, ind + 2);
            ind += 3;
            // Repeat each color 3 times for the four vertices of the face
            const c = [0.9, 0.9, 0.9, 0.9];
            colors.push(c[0], c[1], c[2], c[3]);
            colors.push(c[0], c[1], c[2], c[3]);
            colors.push(c[0], c[1], c[2], c[3]);
            textureCoordinates.push(0, 0, 0, 0, 0, 0, 0, 0);
            vertCount += 3;
        }
    }
    
    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.

    // Create a buffer for the cube's vertex positions.
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);

    // Build the element array buffer; this specifies the indices
    // into the vertex arrays for each face's vertices.
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    // Now send the element array to GL
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    
    return {
        verticesCount: vertCount,
        textureCoord: textureCoordBuffer,
        position: positionBuffer,
        color: colorBuffer,
        indices: indexBuffer,
    };
}

//
// Draw the scene.
//
function drawScene(gl, programInfo, buffers, deltaTime, texture) {
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    gl.clearDepth(1.0); // Clear everything
    gl.enable(gl.DEPTH_TEST); // Enable depth testing
    gl.depthFunc(gl.LEQUAL); // Near things obscure far things

    // Clear the canvas before we start drawing on it.

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Create a perspective matrix, a special matrix that is
    // used to simulate the distortion of perspective in a camera.
    
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projectionMatrix = mat4.create();

    // note: glmatrix.js always has the first argument
    // as the destination to receive the result.
   // mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
    const eye = vec3.fromValues(0, 0, - 1 - (CONFIG.eyePosition / EarthRadiusEquator));
    
    const lookAtAngleMax = Math.asin(1 / (1 + CONFIG.eyePosition / EarthRadiusEquator));
    const lookAt = vec3.fromValues(0, Math.tan(CONFIG.eyeAngle * lookAtAngleMax) * (EarthSkew + CONFIG.eyePosition / EarthRadiusPolar) , 0);
    const lookAtMatrix = mat4.create();
    const perspectiveMatrix = mat4.create();
    
    mat4.lookAt(lookAtMatrix, eye, lookAt, vec3.fromValues(0, 1, 0));
    mat4.perspective(perspectiveMatrix, CONFIG.fieldOfView, aspect, CONFIG.zNear, CONFIG.zFar);
    mat4.multiply(projectionMatrix, lookAtMatrix, projectionMatrix);
    mat4.multiply(projectionMatrix, perspectiveMatrix, projectionMatrix);

    const rotationMatrix = mat4.create();
    const zoomRotCoeef = CONFIG.eyePosition / 8000;
    CONFIG.eyeLon += deltaTime * CONFIG.rotLonSpeed * zoomRotCoeef;
    if (CONFIG.eyeLon > 180) {
        CONFIG.eyeLon -= 360;
    }
    CONFIG.eyeLat += CONFIG.rotLatDir * deltaTime * CONFIG.rotLatSpeed * zoomRotCoeef;
    if (CONFIG.rotLatSpeed > 0 || CONFIG.rotLonSpeed > 0) {
        updateText();
    }
    if (CONFIG.eyeLat >= 90) {
        CONFIG.eyeLat = 90;
        CONFIG.rotLatDir = -1;
    }
    if (CONFIG.eyeLat <= -90) {
        CONFIG.eyeLat = -90;
        CONFIG.rotLatDir = 1;
    }
    mat4.rotate(
        rotationMatrix, // destination matrix
        rotationMatrix, // matrix to rotate
        - CONFIG.eyeLat / (180 / Math.PI), // amount to rotate in radians
        [1, 0, 0]
    ); // axis to rotate around (X)

    mat4.rotate(
        rotationMatrix, // destination matrix
        rotationMatrix, // matrix to rotate
        - CONFIG.eyeLon / (180 / Math.PI), // amount to rotate in radians
        [0, 1, 0]
    ); // axis to rotate around (Z)

    // Tell WebGL how to pull out the positions from the position
    // buffer into the vertexPosition attribute
    {
        const numComponents = 3;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexPosition,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    }

    // Tell WebGL how to pull out the colors from the color buffer
    // into the vertexColor attribute.
    {
        const numComponents = 4;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.color);
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexColor,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexColor);
    }

    // Tell WebGL how to pull out the texture coordinates from
    // the texture coordinate buffer into the textureCoord attribute.
    {
        const numComponents = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
        gl.vertexAttribPointer(
            programInfo.attribLocations.textureCoord,
            numComponents,
            type,
            normalize,
            stride,
            offset
        );
        gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    }

    // Tell WebGL which indices to use to index the vertices
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.indices);
    // Tell WebGL to use our program when drawing
    gl.useProgram(programInfo.program);
    // Set the shader uniforms
    
    gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
    gl.uniformMatrix4fv(programInfo.uniformLocations.rotationMatrix, false, rotationMatrix);
    // Specify the textures
    // Tell WebGL we want to affect texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    // // Bind the texture to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Tell the shader we bound the texture to texture unit 0
    gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

    {
        const type = gl.UNSIGNED_SHORT;
        const offset = 0;
        gl.drawElements(gl[CONFIG.drawMode], buffers.verticesCount, type, offset);
    }
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    // Create the shader program
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    // If creating the shader program failed, alert

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert(
            "Unable to initialize the shader program: " +
            gl.getProgramInfoLog(shaderProgram)
        );
        return null;
    }

    return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    // Send the source to the shader object

    gl.shaderSource(shader, source);

    // Compile the shader program

    gl.compileShader(shader);

    // See if it compiled successfully

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(
            "An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader)
        );
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

let textureUploadPending = false;
function uploadTexture(gl, texture, hdcanvas) {
    textureUploadPending = true;
    setTimeout(() => {
        if (!textureUploadPending) {
            return false;
        }
        textureUploadPending = false;
        const level = 0;
        const internalFormat = gl.RGBA;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, hdcanvas);
        // WebGL1 has different requirements for power of 2 images
        // vs non power of 2 images so check if the image is a  power of 2 in both dimensions.
        gl.generateMipmap(gl.TEXTURE_2D);
        // No, it's not a power of 2. Turn off mips and set wrapping to clamp to edge
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }, 50);
}

function loadTilesTexture(gl) {
    const texture = gl.createTexture();
    const hdcanvas = document.querySelector("#hiddencanvas");
    hdcanvas.width = (HiddenCanvasTiles + 1) * TileSize;
    // reserve 1st row for empty tiles
    hdcanvas.height = (HiddenCanvasTiles + 1) * TileSize;
    const ctx = hdcanvas.getContext("2d");
    ctx.beginPath();
    ctx.fillStyle = "#eee";
    ctx.fillRect(0, 0, hdcanvas.width, hdcanvas.height);
    ctx.strokeStyle = "#333";
    for (var x = 0; x < hdcanvas.width; x += TileSize / 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, hdcanvas.height);
        ctx.stroke();
    }
    for (var y = 0; y < hdcanvas.height; y += TileSize / 16) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(hdcanvas.width, y);
        ctx.stroke();
    }

    uploadTexture(gl, texture, hdcanvas);
    const zoom = CONFIG.textureTilesZoom;
    const maxTileId = 1 << CONFIG.textureTilesZoom;
    
    const startX = Math.max(0, Math.floor(getTileNumberX(zoom, CONFIG.eyeLon) - HiddenCanvasTiles / 2));
    const startY = Math.max(0, Math.floor(getTileNumberY(zoom, CONFIG.eyeLat) - HiddenCanvasTiles / 2));
    CONFIG.textureTilesBbox[0] = startX;
    CONFIG.textureTilesBbox[1] = startY;
    for (var x = 0; x < HiddenCanvasTiles; x++) {
        if (!(x + startX < maxTileId) ) {
            continue;
        }
        for (var y = 0; y < HiddenCanvasTiles; y++) {
            if (!(y + startY < maxTileId)) {
                continue;
            }   
            const xT = (x + 1);
            const yT = (y + 1);
            const image = new Image();
            image.onload = function () {
                ctx.drawImage(image, xT * TileSize, yT * TileSize, TileSize, TileSize);            
                uploadTexture(gl, texture, hdcanvas);
            };
            image.crossOrigin = "anonymous";
            image.src = CONFIG.defaultURL + "/" + zoom + "/" + 
                (x + startX) + "/" +  (y + startY) + ".png";
        }
    }   
    return texture;
}

function isPowerOf2(value) {
    return (value & (value - 1)) == 0;
}

function updateText() {
    var latText = document.getElementById('latText');
    var lonText = document.getElementById('lonText');
    latText.value = 'LAT: ' + CONFIG.eyeLat.toFixed(5);
    lonText.value = 'LON: ' + CONFIG.eyeLon.toFixed(5);
}

function registerSlider(idParam, uiPrefix, idInput, idLabel, flagParam) {
    var slider = document.getElementById(idInput);
    var sliderText = document.getElementById(idLabel);
    slider.value = CONFIG[idParam];
    sliderText.value = uiPrefix + CONFIG[idParam].toString();
    slider.addEventListener('input', function () {
        //slider.value = CONFIG[idParam].toString();
        CONFIG[idParam] = parseFloat(slider.value);
        if (flagParam) {
            CONFIG[flagParam] = true;
        }
        sliderText.value = uiPrefix + CONFIG[idParam].toString();     
    });
    return slider;
}

function addListeners() {
    var drawMode = document.getElementById('drawMode');
    drawMode.addEventListener('change', function (e) { 
        CONFIG.drawMode = drawMode.options[drawMode.selectedIndex].value;
    });
    registerSlider('rotLonSpeed', 'ROT LON:', 'sliderRotLonSpeed', 'sliderRotLonSpeedText');
    registerSlider('rotLatSpeed', 'ROT LAT:', 'sliderRotLatSpeed', 'sliderRotLatSpeedText');

    
    let mouseCoords, mousedown = false;
    const canvas = document.querySelector("#glcanvas");
    function getClippedCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const clipX = x / rect.width * 2 - 1;
        const clipY = y / rect.height * -2 + 1;
        return [clipX, clipY];
    }
    
    canvas.addEventListener('mousedown', (e) => {
        mousedown = true;
        mouseCoords = getClippedCoords(e);
    });
    canvas.addEventListener('mouseup', (e) => {
        mousedown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
        if (mousedown) {
            let newCoords = getClippedCoords(e);
            CONFIG.eyeLat += (mouseCoords[1] - newCoords[1]) * CONFIG.eyePosition / 400;
            CONFIG.eyeLon += (mouseCoords[0] - newCoords[0]) * CONFIG.eyePosition / 400; 
            updateText();
            mouseCoords = newCoords;
        }
    });

    
    const eyeAngle = document.getElementById("sliderEyeAngle");
    const eyeAngleText = document.getElementById("sliderEyeAngleText");
    function updateEyeAngleTxt() {
        const lookAtAngleMax = Math.asin(1 / (1 + CONFIG.eyePosition / EarthRadiusEquator)) * 180 / Math.PI;
        eyeAngleText.value = "ANGLE: " + eyeAngle.value + ", " + (eyeAngle.value * lookAtAngleMax).toFixed(0) + "°[" + lookAtAngleMax.toFixed(1) + "°]";
    }

    const eyeZoom = document.getElementById("sliderEyePos");
    const eyeZoomText = document.getElementById("sliderEyePosText");
    eyeZoom.value = -(Math.log(CONFIG.eyePosition / 3800) / Math.log(2)) + 5;
    function updateEyeZoomTxt() {
        eyeZoomText.value = "CAM " + CONFIG.eyePosition.toFixed(0) + " km, " + eyeZoom.value + " z"; 
        updateEyeAngleTxt();
    }

    function recalculateZoomValue() {
        // Observation: 9 - [ 230 km], 8 - [ 460 km], 7 - [ 910 km], 6 - [1850 km], 5 - [3900 km]
        CONFIG.eyePosition = Math.pow(2, 5 - eyeZoom.value) * 3800;
        // CONFIG.eyePosition = 100000 / Math.exp((eyeZoom.value + 2)/ 20 * Math.log(10000));
        updateEyeZoomTxt();
    }
    updateEyeZoomTxt();

    eyeZoom.addEventListener('input', function () {
        recalculateZoomValue();
    });
    canvas.addEventListener('wheel', (e) => {
        const delta = -(0.05 * Math.floor(e.deltaY / 4));
        eyeZoom.value = parseFloat(eyeZoom.value) + delta;
        
        recalculateZoomValue();
    });
    updateEyeAngleTxt();
    eyeAngle.addEventListener('input', function () {
        CONFIG.eyeAngle = eyeAngle.value;
        updateEyeAngleTxt();
    });

    
    
    registerSlider('zNear', 'zNear:', 'sliderZNear', 'sliderZNearText');
    registerSlider('zFar', 'zFar:', 'sliderZFar', 'sliderZFarText');

    registerSlider('vertexZoom', 'Vertex Zoom:', 'sliderZoom', 'sliderZoomText', 'updateBuffer');
    registerSlider('textureTilesZoom', 'Tiles Zoom:', 'sliderTextureZoom', 'sliderTextureZoomText', 'loadTexture' );
    
    updateText();

}