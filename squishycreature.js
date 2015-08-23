'use strict';

var SquishyCreature = function(options) {
    var defaults = {
        gl: null,
        physics: null
    };
    this.time = 0.0;
    objectUtil.initWithDefaults(this, defaults, options);
    this.organs = [];
    this.organRenderers = [];
    
    var heartRenderer = new SoftBodyRenderer(this.gl, 'test.png');
    var liverRenderer = new SoftBodyRenderer(this.gl, 'test.png');
    var intestineRenderer = new SoftBodyRenderer(this.gl, 'test.png');

    var grid;

    grid = this.physics.generateMesh({x: 0, y: 100, width: 2, height: 2});
    grid.renderer = heartRenderer;
    this.organs.push(grid);

    grid = this.physics.generateMesh({x: -20, y: -100, width: 4, height: 3});
    grid.renderer = liverRenderer;
    this.organs.push(grid);

    grid = this.physics.generateMesh({x: -500, y: -200, width: 25, height: 1, initScale: 30});
    grid.renderer = intestineRenderer;
    this.organs.push(grid);
};

SquishyCreature.prototype.render = function(worldTransform) {
    for (var i = 0; i < this.organs.length; ++i) {
        this.organs[i].renderer.render(this.organs[i], worldTransform);
    }
};

SquishyCreature.prototype.update = function(deltaTime) {
    this.time += deltaTime;
    var pulseModifier = 1.0 + Math.sin(this.time * 3) * 0.1;
    for (var i = 0; i < this.organs.length; ++i) {
        this.organs[i].parameters.pulseModifier = pulseModifier;
    }
};