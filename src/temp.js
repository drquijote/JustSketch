// In areaManager.js, add these four new functions inside the AreaManager class.

/**
 * Main overlap check. Iterates through all existing polygons and checks for intersection.
 * @param {object} newPolygon - The newly created polygon to check.
 */
checkForAreaOverlap(newPolygon) {
    if (!AppState.drawnPolygons || AppState.drawnPolygons.length < 2) {
        return; // No need to check if there's only one polygon
    }

    for (const existingPolygon of AppState.drawnPolygons) {
        if (newPolygon.id === existingPolygon.id) {
            continue; // Don't check a polygon against itself
        }

        // Check for intersection using the Separating Axis Theorem
        if (this.doPolygonsIntersect(newPolygon, existingPolygon)) {
            console.clear();
            console.warn(`[OVERLAP DETECTED] Area "${newPolygon.label}" is geometrically overlapping with area "${existingPolygon.label}".`);
            // Stop after finding the first overlap
            return;
        }
    }
}

/**
 * Implements the Separating Axis Theorem to check for intersection.
 * @param {object} polyA - The first polygon.
 * @param {object} polyB - The second polygon.
 * @returns {boolean} - True if the polygons intersect, false otherwise.
 */
doPolygonsIntersect(polyA, polyB) {
    const axesA = this.getAxes(polyA.path);
    const axesB = this.getAxes(polyB.path);

    // Check all axes from the first polygon
    for (const axis of axesA) {
        const p1 = this.projectPolygon(axis, polyA.path);
        const p2 = this.projectPolygon(axis, polyB.path);
        // If there is no overlap on this axis, they don't intersect
        if (p1.max < p2.min || p2.max < p1.min) {
            return false;
        }
    }

    // Check all axes from the second polygon
    for (const axis of axesB) {
        const p1 = this.projectPolygon(axis, polyA.path);
        const p2 = this.projectPolygon(axis, polyB.path);
        // If there is no overlap on this axis, they don't intersect
        if (p1.max < p2.min || p2.max < p1.min) {
            return false;
        }
    }

    // If no separating axis was found, the polygons are intersecting
    return true;
}

/**
 * Gets the perpendicular axes for each edge of a polygon.
 * @param {Array<object>} path - The vertices of the polygon.
 * @returns {Array<object>} - A list of normalized axis vectors.
 */
getAxes(path) {
    const axes = [];
    for (let i = 0; i < path.length; i++) {
        const p1 = path[i];
        const p2 = path[(i + 1) % path.length];
        const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
        // Get the perpendicular vector (the normal)
        const normal = { x: -edge.y, y: edge.x };
        // Normalize the vector (convert to a unit vector)
        const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
        axes.push({ x: normal.x / length, y: normal.y / length });
    }
    return axes;
}

/**
 * Projects a polygon's vertices onto a given axis.
 * @param {object} axis - The normalized axis to project onto.
 * @param {Array<object>} path - The vertices of the polygon.
 * @returns {object} - An object with the min and max projection values.
 */
projectPolygon(axis, path) {
    let min = Infinity;
    let max = -Infinity;
    for (const vertex of path) {
        // Project the vertex onto the axis using the dot product
        const dotProduct = (vertex.x * axis.x) + (vertex.y * axis.y);
        min = Math.min(min, dotProduct);
        max = Math.max(max, dotProduct);
    }
    return { min, max };
}