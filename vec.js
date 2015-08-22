/**
 * Alternate vec implementation for the physics
 This one uses the approach of C += vs + operators
 */
var CVec = function(x, y) {
    this.type = 'CVector';
    this.x = x ? x : 0;
    this.y = y ? y : 0;
}

CVec.prototype.isub = function(other) {
    this.x -= other.x;
    this.y -= other.y;
    return this;
}
CVec.prototype.sub = function(other) {
    return new CVec(
        this.x - other.x,
        this.y - other.y
    );
}
CVec.prototype.iadd = function(other) {
    this.x += other.x;
    this.y += other.y;
    return this;
}
CVec.prototype.add = function(other) {
    return new CVec(
        this.x + other.x,
        this.y + other.y
    );
}

CVec.prototype.imul = function(scalar) {
    this.x *= scalar;
    this.y *= scalar;
    return this;
}
CVec.prototype.mul = function(scalar) {
    return new CVec(
        this.x * scalar,
        this.y * scalar
    )
}
CVec.prototype.idiv = function(scalar) {
    this.x /= scalar;
    this.y /= scalar;
    return this;
}
CVec.prototype.div = function(scalar) {
    return new CVec(
        this.x / scalar,
        this.y / scalar
    )
}
CVec.prototype.normalized = function() {
    var x = this.x, y = this.y;
    var length = this.length();
    return new CVec(x/length, y/length);
}

CVec.prototype.normalize = function() {
    var x=this.x, y=this.y;
    var length = this.length();
    this.x = x/length;
    this.y = y/length;
    return this;
}

CVec.prototype.length = function() {
    return Math.sqrt(this.x*this.x + this.y*this.y);
}

CVec.prototype.distance = function(other) {
    var x = this.x - other.x;
    var y = this.y - other.y;
    return Math.sqrt(x*x + y*y);
}

CVec.prototype.copy = function() {
    return new CVec(this.x, this.y);
}
