'use strict';

var SoftBodyRenderer = function(gl, src) {
    this.sprite = new Sprite(src, Sprite.loadAsGLTexture(gl));
    this.gl = gl;
    this.vertexBuffer = gl.createBuffer();
    this.texCoordBuffer = gl.createBuffer();
    this.positionData = null;
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
 *        getRadius: {function returning number}
 *     }
 *   ]
 * }
 * With positions of points forming a rectangular grid in a column-major order.
 * @param {Array} worldTransform Transform from world to GL unit coordinates as 4x4 matrix.
 */
SoftBodyRenderer.prototype.render = function(grid, worldTransform, hilight, hilightTexCoord) {
    if (!this.sprite.loaded)
        return;
    
    var gl = this.gl;
    
    SoftBodyRenderer.shader.use({'u_tex': this.sprite.texture, 'u_worldTransform': worldTransform, 'u_hilight': hilight, 'u_hilightTexCoord': hilightTexCoord});
    
    var triangleCount = 4 * (grid.width + 1) * (grid.height + 1);
    var vertexCount = triangleCount * 3;
    var texCoordData = null;
    if (this.positionData == null || vertexCount * 2 != this.positionData.length) {
        this.positionData = new Float32Array(vertexCount * 2);
        texCoordData = new Float32Array(vertexCount * 2);
    }
    
    var arrInd = 0;
    for (var x = 0; x <= grid.width; ++x) {
        for (var y = 0; y <= grid.height; ++y) {
            // Should do with an index buffer...
            SoftBodyRenderer.pushExtendedGridTriangles(this.positionData, texCoordData, arrInd, grid, x, y);
            arrInd += 2 /* per vertex */ * 3 /* per triangle */ * 4 /* 4 triangles */;
        }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.positionData, gl.DYNAMIC_DRAW);
    var positionAttribLocation = 0;
    gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    if (texCoordData != null) {
        gl.bufferData(gl.ARRAY_BUFFER, texCoordData, gl.DYNAMIC_DRAW);
    }
    var texCoordAttribLocation = 1;
    gl.vertexAttribPointer(texCoordAttribLocation, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, triangleCount * 3);
};

SoftBodyRenderer.getGridPosition = function(grid, xInd, yInd) {
    var positionsIndex = yInd + xInd * (grid.height + 1);
    return grid.positions[positionsIndex];
};

SoftBodyRenderer.pushExtendedGridCoords = function(target, targetTexCoords, arrInd, grid, x, y) {
    /* Corner */
    if ((x == 0 || x == grid.width + 1) && (y == 0 || y == grid.height + 1)) {
        var x2 = x > 0 ? grid.width : 0;
        var y2 = y > 0 ? grid.height : 0;
        var pos = SoftBodyRenderer.getGridPosition(grid, x2, y2);
        var xInner = x2 == 0 ? 1 : x2 - 1;
        var yInner = y2 == 0 ? 1 : y2 - 1;
        if (xInner < 0 || yInner < 0 || xInner > grid.width || yInner > grid.height) {
            if (xInner < 0 || xInner > grid.width) {
                throw 'tubes must be horizontal!';
            }
            yInner = 0;
            var posInner = SoftBodyRenderer.getGridPosition(grid, xInner, yInner);
            var posDiff = new Vec2(pos.x - posInner.x, pos.y - posInner.y);
            var angle = posDiff.angle();
            if ((y == 0) == (x == 0)) {
                angle += Math.PI * 0.5; // normal angle
            } else {
                angle -= Math.PI * 0.5; // normal angle
            }
            var diff = new Vec2(Math.cos(angle), Math.sin(angle));
            diff.scale(pos.getRadius());
        } else {
            var posInner = SoftBodyRenderer.getGridPosition(grid, xInner, yInner);
            var diff = new Vec2(pos.x - posInner.x, pos.y - posInner.y);
            diff.normalize();
            diff.scale(pos.getRadius());
        }
        target[arrInd] = pos.x + diff.x;
        target[arrInd + 1] = pos.y + diff.y;
    }
    /* Left or right side */
    else if (x == 0 || x == grid.width + 1) {
        var x2 = x > 0 ? grid.width : 0;
        var xInner = x2 == 0 ? 1 : x2 - 1;
        var pos1 = SoftBodyRenderer.getGridPosition(grid, x2, y - 1);
        var pos2 = SoftBodyRenderer.getGridPosition(grid, x2, y);
        var pos = new Vec2((pos1.x + pos2.x) * 0.5, (pos1.y + pos2.y) * 0.5);
        var posDiff = new Vec2(pos2.x - pos1.x, pos2.y - pos1.y);
        var angle = posDiff.angle();
        if (x == 0) {
            angle += Math.PI * 0.5; // normal angle
        } else {
            angle -= Math.PI * 0.5; // normal angle
        }
        var diff = new Vec2(Math.cos(angle), Math.sin(angle));
        diff.scale((pos1.getRadius() + pos2.getRadius()) * 0.5);
        target[arrInd] = pos.x + diff.x;
        target[arrInd + 1] = pos.y + diff.y;
    }
    /* Top or bottom side */
    else if (y == 0 || y == grid.height + 1) {
        var y2 = y > 0 ? grid.height : 0;
        var yInner = y2 == 0 ? 1 : y2 - 1;
        var pos1 = SoftBodyRenderer.getGridPosition(grid, x - 1, y2);
        var pos2 = SoftBodyRenderer.getGridPosition(grid, x, y2);
        var pos = new Vec2((pos1.x + pos2.x) * 0.5, (pos1.y + pos2.y) * 0.5);
        var posDiff = new Vec2(pos2.x - pos1.x, pos2.y - pos1.y);
        var angle = posDiff.angle();
        if (y != 0) {
            angle += Math.PI * 0.5; // normal angle
        } else {
            angle -= Math.PI * 0.5; // normal angle
        }
        var diff = new Vec2(Math.cos(angle), Math.sin(angle));
        diff.scale((pos1.getRadius() + pos2.getRadius()) * 0.5);
        target[arrInd] = pos.x + diff.x;
        target[arrInd + 1] = pos.y + diff.y;
    }
    /* Grid point */
    else if (Math.abs(x % 1 - 0.5) < 0.2 && Math.abs(y % 1 - 0.5) < 0.2) {
        var pos = SoftBodyRenderer.getGridPosition(grid, Math.floor(x), Math.floor(y));
        target[arrInd] = pos.x;
        target[arrInd + 1] = pos.y;
    }
    /* In the middle of four grid points */
    else {
        var pos1 = SoftBodyRenderer.getGridPosition(grid, x - 1, y - 1);
        var pos2 = SoftBodyRenderer.getGridPosition(grid, x - 1, y);
        var pos3 = SoftBodyRenderer.getGridPosition(grid, x, y - 1);
        var pos4 = SoftBodyRenderer.getGridPosition(grid, x, y);
        
        target[arrInd] = (pos1.x + pos2.x + pos3.x + pos4.x) * 0.25;
        target[arrInd + 1] = (pos1.y + pos2.y + pos3.y + pos4.y) * 0.25;
    }
    if (targetTexCoords != null) {
        targetTexCoords[arrInd] = x / (grid.width + 1);
        targetTexCoords[arrInd + 1] = y / (grid.height + 1);
    }
};

SoftBodyRenderer.pushExtendedGridTriangles = function(target, targetTexCoords, arrInd, grid, xInd, yInd) {
    // Draw an envelope shape centered on the grid point using 4 triangles
    SoftBodyRenderer.pushExtendedGridCoords(target, targetTexCoords, arrInd, grid, xInd, yInd);
    SoftBodyRenderer.pushExtendedGridCoords(target, targetTexCoords, arrInd + 2, grid, xInd + 0.5, yInd + 0.5);
    SoftBodyRenderer.pushExtendedGridCoords(target, targetTexCoords, arrInd + 4, grid, xInd, yInd + 1);
    arrInd += 6;
    
    SoftBodyRenderer.pushExtendedGridCoords(target, targetTexCoords, arrInd, grid, xInd, yInd);
    SoftBodyRenderer.pushExtendedGridCoords(target, targetTexCoords, arrInd + 2, grid, xInd + 1, yInd);
    SoftBodyRenderer.pushExtendedGridCoords(target, targetTexCoords, arrInd + 4, grid, xInd + 0.5, yInd + 0.5);
    arrInd += 6;
    
    SoftBodyRenderer.pushExtendedGridCoords(target, targetTexCoords, arrInd, grid, xInd + 1, yInd);
    SoftBodyRenderer.pushExtendedGridCoords(target, targetTexCoords, arrInd + 2, grid, xInd + 1, yInd + 1);
    SoftBodyRenderer.pushExtendedGridCoords(target, targetTexCoords, arrInd + 4, grid, xInd + 0.5, yInd + 0.5);
    arrInd += 6;
    
    SoftBodyRenderer.pushExtendedGridCoords(target, targetTexCoords, arrInd, grid, xInd + 0.5, yInd + 0.5);
    SoftBodyRenderer.pushExtendedGridCoords(target, targetTexCoords, arrInd + 2, grid, xInd + 1, yInd + 1);
    SoftBodyRenderer.pushExtendedGridCoords(target, targetTexCoords, arrInd + 4, grid, xInd, yInd + 1);
    arrInd += 6;
};

SoftBodyRenderer.pushGridCoords = function(target, targetTexCoords, arrInd, grid, xInd, yInd) {
    var pos = SoftBodyRenderer.getGridPosition(grid, xInd, yInd);
    target[arrInd] = (pos.x);
    target[arrInd + 1] = (pos.y);
    if (targetTexCoords != null) {
        targetTexCoords[arrInd] = (xInd / grid.width);
        targetTexCoords[arrInd + 1] = (yInd / grid.height);
    }
};

SoftBodyRenderer.vertexSrc = [
'attribute vec2 aVertexPosition;',
'attribute vec2 a_texCoord;',
'uniform mat4 u_worldTransform;',
'varying vec2 v_texCoord;',
'void main() {',
'    gl_Position = u_worldTransform * vec4(aVertexPosition, 0.0, 1.0);',
'    v_texCoord = a_texCoord;',
'}'
].join('\n');

SoftBodyRenderer.fragmentSrc = [
'precision highp float;',
'uniform sampler2D u_tex;',
'uniform float u_hilight;',
'uniform vec2 u_hilightTexCoord;',
'varying vec2 v_texCoord;',
'void main() {',
'    vec4 texColor = texture2D(u_tex, v_texCoord);',
'    float hilightMul = clamp(1.0 - distance(v_texCoord, u_hilightTexCoord) * 2.0, 0.0, 1.0);',
'    vec4 hilightCol = vec4(vec3(u_hilight * hilightMul), 0);',
'    gl_FragColor = texColor + hilightCol;',
'}'
].join('\n');

SoftBodyRenderer.loadShaders = function(gl) {
    var uniforms = {
        'u_tex': 'tex2d',
        'u_worldTransform': 'Matrix4fv',
        'u_hilight': '1f',
        'u_hilightTexCoord': '2fv'
    };
    SoftBodyRenderer.shader = new ShaderProgram(gl, SoftBodyRenderer.fragmentSrc, SoftBodyRenderer.vertexSrc, uniforms);
};
