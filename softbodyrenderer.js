'use strict';

var SoftBodyRenderer = function(gl, src) {
    this.testSprite = new Sprite(src, Sprite.loadAsGLTexture(gl));
    this.gl = gl;
    this.vertexBuffer = gl.createBuffer();
    this.texCoordBuffer = gl.createBuffer();
    
};

/**
 * @param {Object} grid Positions calculated by physics in the following format:
 * {
 *   width: {number}
 *   height: {number}
 *   positions: [
 *     {
 *        x: {number}
 *        y: {number}
 *        radius: {number}
 *     }
 *   ]
 * }
 * With positions of points forming a rectangular grid in a column-major order.
 */
SoftBodyRenderer.prototype.render = function(grid) {
    if (!this.testSprite.loaded)
        return;
    
    var gl = this.gl;
    
    SoftBodyRenderer.shader.use({'u_tex': this.testSprite.texture});
    
    var arr = [];
    var texArr = [];
    var triangleCount = 0;
    for (var x = 0; x < grid.width; ++x) {
        for (var y = 0; y < grid.height; ++y) {
            // Should do with an index buffer...
            SoftBodyRenderer.pushGridCoords(arr, texArr, grid, x, y);
            SoftBodyRenderer.pushGridCoords(arr, texArr, grid, x + 1, y);
            SoftBodyRenderer.pushGridCoords(arr, texArr, grid, x, y + 1);
            SoftBodyRenderer.pushGridCoords(arr, texArr, grid, x, y + 1);
            SoftBodyRenderer.pushGridCoords(arr, texArr, grid, x + 1, y);
            SoftBodyRenderer.pushGridCoords(arr, texArr, grid, x + 1, y + 1);
            triangleCount += 2;
        }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
    var positionAttribLocation = 0;
    gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);
    var texCoordAttribLocation = 1;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texArr), gl.STATIC_DRAW);
    gl.vertexAttribPointer(texCoordAttribLocation, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, triangleCount * 3);
};

SoftBodyRenderer.getGridPosition = function(grid, xInd, yInd) {
    var positionsIndex = yInd + xInd * (grid.height + 1);
    return grid.positions[positionsIndex];
};

SoftBodyRenderer.pushGridCoords = function(target, targetTexCoords, grid, xInd, yInd) {
    var pos = SoftBodyRenderer.getGridPosition(grid, xInd, yInd);
    target.push(pos.x);
    target.push(pos.y);
    targetTexCoords.push(xInd / grid.width);
    targetTexCoords.push(yInd / grid.height);
};

SoftBodyRenderer.vertexSrc = [
'attribute vec2 aVertexPosition;',
'attribute vec2 a_texCoord;',
'varying vec2 v_texCoord;',
'void main() {',
'    gl_Position = vec4(aVertexPosition, 0.0, 1.0);',
'    v_texCoord = a_texCoord;',
'}'
].join('\n');

SoftBodyRenderer.fragmentSrc = [
'precision highp float;',
'uniform sampler2D u_tex;',
'varying vec2 v_texCoord;',
'void main() {',
'    vec4 texColor = texture2D(u_tex, v_texCoord);',
'    gl_FragColor = texColor;',
'}'
].join('\n');

SoftBodyRenderer.loadShaders = function(gl) {
    var uniforms = {'u_tex': 'tex2d'};
    SoftBodyRenderer.shader = new ShaderProgram(gl, SoftBodyRenderer.fragmentSrc, SoftBodyRenderer.vertexSrc, uniforms);
};
