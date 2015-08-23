'use strict';

var OrganParameters = [
{
    name: 'heart',
    image_src: 'o_heart.png',
    gridSize: {width: 2, height: 2},
    veinFunc: function(deltaTime) {
        if (this.veins.length > 0) {
            // around 0.017 liters/kg per heartbeat
            var bloodPerTick = 0.02 * this.pulseModifier * deltaTime;
            var spareBlood = this.veins[0].contents.take('blood', bloodPerTick);
            this.contents.blood += spareBlood;
            for (var i = 1; i < this.veins.length; ++i) {
                this.veins[i].contents.blood += this.contents.take('blood', bloodPerTick * 1.1);
            }
        }
    },
    defaultVeins: [
        {
            target: 'lungs',
        },
        {
            target: 'lungs',
        }
    ]
},
{
    name: 'lungs',
    image_src: 'test.png',
    gridSize: {width: 4, height: 3},
    veinFunc: function(deltaTime) {
        if (this.veins.length > 0) {
            var maxBloodPerTick = 0.025 * this.pulseModifier * deltaTime;
            var totalBlood = 0;
            for (var i = 0; i < this.veins.length; ++i) {
                totalBlood += this.veins[i].contents['blood'];
            }
            // TODO: Distribute blood as evenly as possible among veins
            // according to the constraint how much blood can pass through.
            // Also oxygenate the blood.
        }
    },
    defaultVeins: []
},
{
    name: 'intestine',
    image_src: 'test.png',
    gridSize: {width: 25, height: 0},
    veinFunc: function(deltaTime) {
        if (this.veins.length > 0) {
            var maxBloodPerTick = 0.025 * this.pulseModifier * deltaTime;
            var totalBlood = 0;
            for (var i = 0; i < this.veins.length; ++i) {
                totalBlood += this.veins[i].contents['blood'];
            }
            // TODO: Distribute blood as evenly as possible among veins
            // according to the constraint how much blood can pass through.
            // Also add nutrients to the blood.
        }
    },
    defaultVeins: []
}
];

var OrganContents = function() {
    var defaults = {
        'blood': 0.1, // kg
        'air': 0.0, // kg
        'nutrients': 0.0 // kg
    };
};

OrganContents.prototype.take = function(substance, amount) {
    if (this[substance] < amount) {
        amount = this[substance];
    }
    this.substance -= amount;
    return amount;
};

var SquishyCreature = function(options) {
    var defaults = {
        gl: null,
        physics: null
    };
    this.time = 0.0;
    objectUtil.initWithDefaults(this, defaults, options);
    this.organs = [];
    
    // Initialize organs
    for (var i = 0; i < OrganParameters.length; ++i) {
        var organ = this.physics.generateMesh({
            x: 0,
            y: i * 200 - 200, 
            width: OrganParameters[i].gridSize.width,
            height: OrganParameters[i].gridSize.height,
            collisionGroup: 0
        });
        organ.renderer = OrganParameters[i].renderer;
        organ.name = OrganParameters[i].name;
        organ.contents = new OrganContents();
        organ.veins = [];
        organ.veinFunc = OrganParameters[i].veinFunc;
        this.organs.push(organ);
    }
    // Add default veins
    for (var i = 0; i < OrganParameters.length; ++i) {
        var organ = this.organs[i];
        for (var j = 0; j < OrganParameters[i].defaultVeins.length; ++j) {
            var vein = OrganParameters[i].defaultVeins[j];
            var x = organ.positions[0].x;
            var y = organ.positions[0].y;
            var organ2 = this.findOrganByName(vein.target);
            var vein = this.physics.generateMesh({
                x: x,
                y: y,
                width: 10,
                height: 0,
                collisionGroup: 1,
                initScale: 20
            });
            vein.renderer = SquishyCreature.veinRenderer;
            vein.contents = new OrganContents();
            vein.veinFunc = function() {};
            // TODO: Attach vein to organs with springs
            this.organs.push(vein);
            
            organ.veins.push(vein);
            organ2.veins.push(vein);
        }
    }
};

SquishyCreature.initRenderers = function(gl) {
    for (var i = 0; i < OrganParameters.length; ++i) {
        OrganParameters[i].renderer = new SoftBodyRenderer(gl, OrganParameters[i].image_src);
    }
    
    SquishyCreature.veinRenderer = new SoftBodyRenderer(gl, 'test.png');
};

SquishyCreature.prototype.findOrganByName = function(name) {
    for (var i = 0; i < this.organs.length; ++i) {
        if (this.organs[i].name == name) {
            return this.organs[i];
        }
    }
    return null;
};

SquishyCreature.prototype.render = function(worldTransform) {
    for (var i = 0; i < this.organs.length; ++i) {
        this.organs[i].renderer.render(this.organs[i], worldTransform);
    }
};

SquishyCreature.prototype.renderDebug = function(ctx, physics, worldTransform) {
    ctx.save();
    var transX = ctx.canvas.width * 0.5;
    var transY = ctx.canvas.height * 0.5;
    ctx.translate(transX, transY);
    var scaleX = worldTransform[0] * ctx.canvas.width * 0.5;
    var scaleY = worldTransform[5] * ctx.canvas.height * 0.5;
    ctx.scale(scaleX, -scaleY);
    for (var i = 0; i < this.organs.length; ++i) {
        physics.renderDebug(ctx, this.organs[i]);
    }
    ctx.restore();
};

SquishyCreature.prototype.update = function(deltaTime) {
    this.time += deltaTime;
    var pulseModifier = 1.0 + Math.sin(this.time * 3) * 0.1;
    for (var i = 0; i < this.organs.length; ++i) {
        this.organs[i].parameters.pulseModifier = pulseModifier;
        this.organs[i].veinFunc(deltaTime);
    }
};
