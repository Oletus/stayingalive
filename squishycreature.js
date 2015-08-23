'use strict';

var SquishyCreature = function(options) {
    var defaults = {
        gl: null,
        physics: null
    };
    objectUtil.initWithDefaults(this, defaults, options);
    this.organs = [];
    this.organRenderers = [];
    
    var heartRenderer = new SoftBodyRenderer(this.gl, 'test.png');
    var liverRenderer = new SoftBodyRenderer(this.gl, 'test.png');

    var grid = this.physics.generateMesh({x: 0, y: 0, width: 2, height: 2});
    grid.renderer = heartRenderer;
    this.organs.push(grid);
    var grid = this.physics.generateMesh({x: -20, y: -200, width: 4, height: 3});
    grid.renderer = liverRenderer;
    this.organs.push(grid);
    
};

SquishyCreature.prototype.render = function(worldTransform) {
    for (var i = 0; i < this.organs.length; ++i) {
        this.organs[i].renderer.render(this.organs[i], worldTransform);
    }
};

SquishyCreature.prototype.update = function(deltaTime) {
};