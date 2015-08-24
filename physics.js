'use strict';

var Point = function(grid, x, y, radius) {
    this.grid = grid;
    this.x = x;
    this.y = y;
    this.radius = radius;
}

Point.prototype.getRadius = function() {
    return this.radius * this.grid.parameters.pulseModifier;
}

var Particle = function(point, springs, inertia, collisionGroup, state) {
    this.point = point;
    if (!(springs instanceof Array)) {
        springs = [springs];
    }
    this.springs = springs;
    this.inertia = inertia ? inertia : 1;
    this.state_last = state ? state : new State();
    this.state = this.state_last.copy();

    this.collides = true;
    this.collisionGroup = collisionGroup ? collisionGroup : 0;
    this.contacts = [];
    this.attachment = null;
    this.externalForce = 0;
    this.externalForceTarget = null;
}

var State = function(position, momentum) {
    this.position = position ? position : new CVec(0,0);
    this.momentum = momentum ? momentum : new CVec(0,0);
};

State.prototype.set = function(other) {
    this.position.set(other.position);
    this.momentum.set(other.momentum);
    return this;
}

State.prototype.copy = function() {
    return new State(this.position.copy(), this.momentum.copy());
}

State.prototype.iadd = function(derivative) {
    this.position.iadd(derivative.dx);
    this.momentum.iadd(derivative.dp);
    return this;
}

/**
 * Holds the intermediate state for the integration
 */
var Derivative = function(dx, dp) {
    this.dx = dx ? dx : new CVec(0,0); //velocity
    this.dp = dp ? dp : new CVec(0,0); //force
}

Derivative.prototype.iadd = function(other) {
    this.dx.iadd(other.dx);
    this.dp.iadd(other.dp);
    return this;
}

Derivative.prototype.add = function(other) {
    return new Derivative(
        this.dx.add(other.dx),
        this.dp.add(other.dp)
    )
}

Derivative.prototype.mul = function(scalar) {
    return new Derivative(
        this.dx.mul(scalar),
        this.dp.mul(scalar)
    )
}

Derivative.prototype.imul = function(scalar) {
    this.dx.imul(scalar);
    this.dp.imul(scalar);
    return this;
}

var Contact = function(normal, depth, old_state, other_old_state, stiffness, damping) {
    this.normal = normal ? normal : new CVec(0,0);
    this.depth = depth ? depth : 0;
    this.old_state = old_state ? old_state : new State();
    this.other_old_state = other_old_state ? other_old_state : new State();
    this.stiffness = stiffness ? stiffness : 10;
    this.damping = damping ? damping : 0.1;
}

Contact.prototype.calculate = function(state) {
    var normal = this.normal;
    var stiffness=this.stiffness, damping=this.damping;
    var depth = this.depth;
    var dot = normal.dot(this.old_state.momentum.sub(this.other_old_state.momentum));
    //nkd - bn(n.v)
    return normal.mul(stiffness).mul(depth).sub(normal.mul(damping).mul(dot));
};

var Spring = function(point, stiffness, damping, distance, particle1, particle2, gridParameters) {
    this.point = point ? point : new CVec(0,0);
    this.stiffness = stiffness ? stiffness : 10;
    this.damping = damping ? damping : 0.25;
    this.distance = distance ? distance : 0;
    //TODO: Make factor (1.8) controllable
    this.maxdistance = distance * 1.8;

    this.particle1 = particle1;
    this.particle2 = particle2;
    this.gridParameters = gridParameters;
    this.stress = 0;
}

Spring.prototype.calculate = function(state) {
    var point = this.point;
    var stiffness=this.stiffness, damping=this.damping;
    var distance = this.getCurrentDistance();
    //x = pt-s.x
    var transform = point.sub(state.position);
    //k * x - s.p*d
    if (distance == 0) return transform.mul(stiffness).sub(state.momentum.mul(damping));
    //|x|
    var length = transform.length();
    this.stress = length / this.maxDistance();
    // t = (|x|-d)(x/|x|)
    transform.idiv(length).imul(length-distance);
    //k * t - s.p*d
    return transform.mul(stiffness).sub(state.momentum.mul(damping));
};

Spring.prototype.getCurrentDistance = function() {
    if (this.gridParameters === undefined) return this.distance;
    return this.distance * this.gridParameters.pulseModifier;
};

Spring.prototype.minDistance = function() {
    //TODO: Make factor (0.9) controllable
    if (particle1 == undefined || particle2 === undefined) return this.getCurrentDistance() * 0.9;
    return Math.max(this.particle1.point.getRadius() + this.particle2.point.getRadius(), this.getCurrentDistance() * 0.9);
};

Spring.prototype.maxDistance = function() {
    if (this.gridParameters === undefined) return this.maxdistance;
    return this.maxdistance * this.gridParameters.pulseModifier;
};

var getExternalForce = function(particle, state) {
    if (particle.externalForce > 0) {
        var point = particle.externalForceTarget;
        var stiffness=100, damping=0.9;
        //x = pt-s.x
        var transform = point.sub(state.position);
        //k * x - s.p*d
        return transform.mul(stiffness).sub(state.momentum.mul(damping));
    }
    return null;
};

var acceleration = function(particle, state) {
    //TODO
    var force = new CVec();
    for (var i = 0; i < particle.springs.length; ++i) {
        force.iadd(particle.springs[i].calculate(state));
        
        // External force affects connected particles through this hack
        var part2 = particle.springs[i].particle2;
        var state2 = part2.state;
        var part2Dist = state2.position.distance(state.position);
        if (part2Dist < 150) {
            var externalForce = getExternalForce(part2, state2);
            if (externalForce !== null) {
                force.iadd(externalForce.imul((150 - part2Dist) / 150));
            }
        }
    }
    for (var i = 0; i < particle.contacts.length; ++i) {
        force.iadd(particle.contacts[i].calculate(state));
    }
    if (particle.attachment != null) {
        force.iadd(particle.attachment.spring.calculate(state));
    }
    particle.contacts.length = 0;
    force.iadd(new CVec((Math.random()-.5)*400, (Math.random()-.5)*400));
    
    var externalForce = getExternalForce(particle, state);
    if (externalForce !== null) {
        force.iadd(externalForce);
    }
    return force;
}

var evaluate = function(particle, initial, dt, derivative) {
    var state = initial.copy().iadd(derivative.mul(dt));

    var derivative = new Derivative(
        state.momentum.div(particle.inertia),
        acceleration(particle, state)
    );
    return derivative;
}

var d0 = new Derivative();
var integrate = function(particle, state, dt) {
    var d1 = evaluate(particle, state, dt*0.0, d0);
    var d2 = evaluate(particle, state, dt*0.5, d1);
    var d3 = evaluate(particle, state, dt*0.5, d2);
    var d4 = evaluate(particle, state, dt*1.0, d3);

    d2.iadd(d3).imul(2);
    d4.iadd(d1).iadd(d2).imul(1/6);

    state.position.iadd(d4.dx.mul(dt));
    state.momentum.iadd(d4.dp.mul(dt));
}

/**
 * An updater to handle the physics loop and state changes
 */
var GamePhysics = function(resizer) {
    this.canvas = resizer.getCanvas();
    this.gl = this.canvas.getContext('webgl');
    Sprite.gl = this.gl;

    this.particles = [];
    this.springs = [];

    this.playarea = {
        center: new CVec(0,0),
        radius: 500,
        state: new State(),
    }

    this.debug = {};
    this.debug.springs = {};
    this.debug.particles = {};
    this.debug.springs.show = false;
    this.debug.springs.color = '#0f0';
    this.debug.particles.show = false;
    if (DEV_MODE) {
        this.debug.particles.show = true;

        var datinst = dat.instance;
        var gui = datinst.addFolder('Physics');
        var f1 = gui.addFolder('Springs');
        f1.add(this.debug.springs, 'show');
        f1.addColor(this.debug.springs, 'color');
        var f2 = gui.addFolder('Particles');
        f2.add(this.debug.particles, 'show');
    }
};

GamePhysics.prototype.render = function(ctx) {
    // CanvasResizer passes a wrapped 2D context to use here when run in FIXED_COORDINATE_SYSTEM mode,
    // where ctx.canvas.width/height are set to the coordinate system width/height.
    // Otherwise the context initialized here is used.
    if (ctx === undefined) {
        ctx = this.gl;
    }
    var gl = ctx;

    return ctx;
};

GamePhysics.prototype.update = function(deltaTime) {
    //XXX: An accumulator would probably be a good idea here

    // Update previous state
    for (var i = 0; i < this.particles.length; ++i) {
        var particle = this.particles[i];
        particle.state_last.set(particle.state);
    }

    // Detect collisions
    for (var k = 0; k < this.particles.length; ++k) {
        var particle1 = this.particles[k];
        if (!particle1.collides) continue;
        // Maximum bounding area
        if (this.playarea != null) {
            var maxdist = this.playarea.radius;
            var center = this.playarea.center;
            var distanceSq = particle1.state.position.distanceSq(center);
            var maxdistSq = maxdist * maxdist;
            if (distanceSq > maxdistSq) {
                var normal = center.sub(particle1.state.position);
                var distance = normal.length();
                normal.idiv(distance);
                var depth = distance - maxdist;
                particle1.contacts.push(new Contact(normal, depth, particle1.state_last, this.playarea.state, 10000, 0.9));
            }
        }
        // TODO: Optimize this with a grid-based acceleration structure to avoid O(n^2) cost.
        // Could also consider testing only edge particles.
        for (var i = k+1; i < this.particles.length; ++i) {
            var particle2 = this.particles[i];
            if (!particle2.collides) continue;
            if (particle1.collisionGroup != particle2.collisionGroup) continue;
            var minDistance = particle1.point.getRadius() + particle2.point.getRadius();
            var minDistanceSq = minDistance * minDistance;
            var distanceSq = particle1.state.position.distanceSq(particle2.state.position);
            if (distanceSq < minDistanceSq) {
                var normal = particle1.state.position.sub(particle2.state.position);
                var distance = normal.length();
                normal.idiv(distance);
                var depth = minDistance - distance;
                //normal, depth, old_state, other_old_state, stiffness, damping
                particle1.contacts.push(new Contact(normal, depth, particle1.state_last, particle2.state_last, 1000, 0.1));
                particle2.contacts.push(new Contact(normal.inverted(), depth, particle2.state_last, particle1.state_last, 1000, 0.1));
            }
        }
    }


    // Perform integration on all elements
    for (var i = 0; i < this.particles.length; ++i) {
        var particle = this.particles[i];
        var state = particle.state;
        integrate( particle, state, deltaTime );
    }

    //Hard constraints
    for (var j = 0; j < 5; ++j) { // Relaxation
        // Hard constraints for springs
        for (var k = 0; k < this.springs.length; ++k) {
            var maxDistance = this.springs[k].maxDistance();
            if (maxDistance <= 0) return;
            var particle = this.springs[k].particle1;
            var particle2 = this.springs[k].particle2;
            var targetposition = particle2 ? particle2.state.position : this.springs[k].point;
            var distanceSq = particle.state.position.distanceSq(targetposition);
            var maxDistanceSq = maxDistance * maxDistance;
            if (distanceSq > maxDistanceSq) {
                var diff = particle.state.position.sub(targetposition);
                var distance = diff.length();
                diff.idiv(distance);
                diff.imul(-0.5 * (distance - maxDistance));
                particle.state.position.iadd(diff.div(particle.inertia));
            }
        }
    }
    
    for (var i = 0; i < this.particles.length; ++i) {
        // Update points
        var particle = this.particles[i];
        particle.point.x = particle.state.position.x;
        particle.point.y = particle.state.position.y;
    }
};

GamePhysics.prototype.renderHUD = function(ctx) {
    ctx.save();
    if (this.playarea != null) {
        var pos = this.playarea.center;
        var radius = this.playarea.radius;
        ctx.fillRect(pos.x - 2, pos.y - 2, 4, 4);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    if (this.debug.particles.show) {
        for (var j = 0; j < this.particles.length; ++j) {
            var particle = this.particles[j];
            var pos = particle.point;
            ctx.fillStyle = particle.collides ? '#fff' : '#f00';
            ctx.fillRect(pos.x - 2, pos.y - 2, 4, 4);
            ctx.strokeStyle = particle.collides ? '#000' : '#f00';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, pos.getRadius(), 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    if (this.debug.springs.show) {
        for (var j = 0; j < this.springs.length; ++j) {
            var spring = this.springs[j];
            var pos1 = spring.particle1.point;
            if (spring.particle2 !== null) {
                var pos2 = spring.particle2.point;
                ctx.strokeStyle = this.debug.springs.color;
                ctx.beginPath();
                ctx.moveTo(pos1.x, pos1.y);
                ctx.lineTo(pos2.x, pos2.y);
                ctx.stroke();
            }
        }
    }
    ctx.restore();
};

GamePhysics.prototype.renderDebugGrid = function(ctx, grid) {
};

GamePhysics.prototype.getNearestParticle = function(worldPos, smallestDistance) {
    var nearestParticle = null;
    for (var i = 0; i < this.particles.length; ++i) {
        if (this.particles[i].collides) {
            var distance = this.particles[i].state.position.distance(worldPos);
            if (distance < smallestDistance) {
                nearestParticle = this.particles[i];
                smallestDistance = distance;
            }
        }
    }
    return nearestParticle;
};

GamePhysics.prototype.affixPoint = function(point, pos) {
    var particle = point.particle;
    var spring = new Spring(pos, 1000, 0.9, 0, particle, null);
    spring.maxdistance = 1;
    this.springs.push(spring);
}

GamePhysics.prototype.attachPoints = function(point1, point2) {
    var particle1 = point1.particle;
    var particle2 = point2.particle;
    var spring1 = new Spring(particle2.state_last.position, 100, 0.9, 0, particle1, particle2);
    var spring2 = new Spring(particle1.state_last.position, 100, 0.9, 0, particle2, particle1);
    spring1.maxdistance = 8;
    spring2.maxdistance = 8;
    particle1.attachment = {particle: particle2, spring: spring1};
    particle2.attachment = {particle: particle1, spring: spring2};
    this.springs.push(spring1);
    this.springs.push(spring2);
}

GamePhysics.prototype.detachPoint = function(point) {
    var particle1 = point.particle;
    if (particle1.attachment == null) return;
    var particle2 = particle1.attachment.particle;
    arrayUtil.remove(this.springs, particle1.attachment.spring);
    arrayUtil.remove(this.springs, particle2.attachment.spring);
    particle1.attachment = null;
    particle2.attachment = null;
}

GamePhysics.prototype.getAttachmentStress = function(point) {
    var particle1 = point.particle;
    if (particle1.attachment == null) return 0;
    var particle2 = particle1.attachment.particle;
    var particle = particle1;
    if (particle1.springs.length > particle2.springs.length) {
        particle = particle2;
    }
    // Test stress on particle.springs
    var maxStress = 0;
    for (var i = 0; i < particle.springs.length; ++i) {
        var spring = particle.springs[i];
        if (spring.stress > maxStress) {
            maxStress = spring.stress;
        }
    }
    return maxStress;
};

GamePhysics.prototype.generateMesh = function(options) {
    var defaults = {
        width: 3,
        height: 3,
        initScale: 50,
        x: 0,
        y: 0,
        collisionGroup: 0,
        collisionDef: null,
    };
    var obj = {};
    objectUtil.initWithDefaults(obj, defaults, options);

    var grid = {
        width: obj.width,
        height: obj.height,
        positions: [],
        veinIndices: [],
        parameters: {
            pulseModifier: 1
        }
    };
    var width = obj.width;
    var height = obj.height;
    var collisionDef = obj.collisionDef

    var collides = null;
    if (collisionDef != null) {
        if (collisionDef.length != height+1) throw "Collision Definition for mesh doesn't align to mesh";
        collides = [];
        for (var sy = 0; sy < collisionDef.length; ++sy) {
            var arr = collisionDef[sy];
            if (arr.length != width+1) throw "Collision Definition for mesh doesn't align to mesh";
            collides[collisionDef.length - 1 - sy] = [];
            for (var sx = 0; sx < arr.length; ++sx) {
                // Flip y because our world vertical axis is towards top, and code/images vertical is towards bottom
                collides[collisionDef.length - 1 - sy][sx] = (arr[sx] != ' ');
                if (arr[sx] != 'x' && arr[sx] != ' ') {
                    grid.veinIndices.push({type: arr[sx], index: sx * (height + 1) + collisionDef.length - 1 - sy});
                }
            }
        }
    }

    var gridparticles = [];
    var collisionGroup = obj.collisionGroup;

    for (var sx = 0; sx <= width; ++sx) {
        gridparticles[sx] = [];
        for (var sy = 0; sy <= height; ++sy) {
            var point = new Point(grid, sx * obj.initScale + obj.x, sy * obj.initScale + obj.y, 0.45 * obj.initScale)
            grid.positions.push(point);
            var springs = [];
            var state = new State(new CVec(point.x, point.y));
            var particle = new Particle(point, springs, point.radius/20, collisionGroup, state);
            if (collides != null) particle.collides = collides[sy][sx];
            gridparticles[sx][sy] = particle;
            point.particle = particle;
            this.particles.push(particle);
        }
    }

    for (var sx = 0; sx <= width; ++sx) {
        for (var sy = 0; sy <= height; ++sy) {
            var particle = gridparticles[sx][sy];
            // Horizontal / vertical springs
            if (sx > 0) particle.springs.push(this.createSpring(particle, gridparticles[sx-1][sy], false, grid.parameters));
            if (sx < width) particle.springs.push(this.createSpring(particle, gridparticles[sx+1][sy], false, grid.parameters));
            if (sy > 0) particle.springs.push(this.createSpring(particle, gridparticles[sx][sy-1], false, grid.parameters));
            if (sy < height) particle.springs.push(this.createSpring(particle, gridparticles[sx][sy+1], false, grid.parameters));
            // Diagonal springs
            if (sy < height && sx < width) particle.springs.push(this.createSpring(particle, gridparticles[sx+1][sy+1], true, grid.parameters));
            if (sy > 0 && sx > 0) particle.springs.push(this.createSpring(particle, gridparticles[sx-1][sy-1], true, grid.parameters));
            if (sy < height && sx > 0) particle.springs.push(this.createSpring(particle, gridparticles[sx-1][sy+1], true, grid.parameters));
            if (sy > 0 && sx < width) particle.springs.push(this.createSpring(particle, gridparticles[sx+1][sy-1], true, grid.parameters));

            //Second order
            // Horizontal / vertical springs
            if (sx > 1) particle.springs.push(this.createSpring(particle, gridparticles[sx-2][sy], false, grid.parameters));
            if (sx < width - 1) particle.springs.push(this.createSpring(particle, gridparticles[sx+2][sy], false, grid.parameters));
            if (sy > 1) particle.springs.push(this.createSpring(particle, gridparticles[sx][sy-2], false, grid.parameters));
            if (sy < height - 1) particle.springs.push(this.createSpring(particle, gridparticles[sx][sy+2], false, grid.parameters));
            // Diagonal springs
            if (sy < height-1 && sx < width-1) particle.springs.push(this.createSpring(particle, gridparticles[sx+2][sy+2], true, grid.parameters));
            if (sy > 1 && sx > 1) particle.springs.push(this.createSpring(particle, gridparticles[sx-2][sy-2], true, grid.parameters));
            if (sy < height-1 && sx > 1) particle.springs.push(this.createSpring(particle, gridparticles[sx-2][sy+2], true, grid.parameters));
            if (sy > 1 && sx < width-1) particle.springs.push(this.createSpring(particle, gridparticles[sx+2][sy-2], true, grid.parameters));
            // Halfsteps
            // if (sy < height-1 && sx < width) particle.springs.push(this.createSpring(particle, gridparticles[sx+1][sy+2], true, grid.parameters));
            // if (sy < height && sx < width-1) particle.springs.push(this.createSpring(particle, gridparticles[sx+2][sy+1], true, grid.parameters));
            // if (sy > 1 && sx > 0) particle.springs.push(this.createSpring(particle, gridparticles[sx-1][sy-2], true, grid.parameters));
            // if (sy > 0 && sx > 1) particle.springs.push(this.createSpring(particle, gridparticles[sx-2][sy-1], true, grid.parameters));
            // if (sy < height && sx > 1) particle.springs.push(this.createSpring(particle, gridparticles[sx-2][sy+1], true, grid.parameters));
            // if (sy < height-1 && sx > 0) particle.springs.push(this.createSpring(particle, gridparticles[sx-1][sy+2], true, grid.parameters));
            // if (sy > 0 && sx < width-1) particle.springs.push(this.createSpring(particle, gridparticles[sx+2][sy-1], true, grid.parameters));
            // if (sy > 1 && sx < width) particle.springs.push(this.createSpring(particle, gridparticles[sx+1][sy-2], true, grid.parameters));
        }
    }

    // This might help if the specific order that the spring hard constraints are solved in is causing trouble
    //this.springs = arrayUtil.shuffle(this.springs);
    
    return grid;
}

GamePhysics.prototype.createSpring = function(particle, target, diagonal, gridParameters) {
    var stiffness = diagonal ? 50 : 20;
    var spring = new Spring(target.state_last.position, stiffness, 0.9, particle.state.position.distance(target.state.position), particle, target, gridParameters);
    this.springs.push(spring);
    return spring;
}
