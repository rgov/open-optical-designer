"use strict";

class Design {
    constructor() {
        this.surfaces = []
        this.center_wavelength = 0.58756;
        this.env_beam_radius = 1;
        this.env_fov_angle = 0;
        this.env_beam_cross_distance = 65;
        this.env_image_radius = 21.6
        this.env_initial_material = AIR_MATERIAL;
    }

    static async importLenFile(e) {
        let file = e.target.files[0];
        if (!file) { return null; }
        let text = await file.text();
        let lines = text.split('\n');
        let i = lines.findIndex((x) => {
            return x.startsWith("NXT ");
        });
        if (i == -1) { throw "missing initial NXT"; }
        i += 1;
        let surfaces = [];
        let surf = new Surface();
        while (i < lines.length) {
            let arg = lines[i].trim().split(' ');
            arg = arg[arg.length - 1];
            if (lines[i].startsWith("GLA ")) {
                surf.material = app.findMaterial(arg);
            } else if (lines[i].startsWith("AIR ")) {
                surf.material = AIR_MATERIAL;
            } else if (lines[i].startsWith("RD ")) {
                surf.radius_of_curvature = Number.parseFloat(arg);
            } else if (lines[i].startsWith("TH ")) {
                surf.thickness = Number.parseFloat(arg);
            } else if (lines[i].startsWith("AP ")) {
                surf.aperture_radius = Number.parseFloat(arg);
            } else if (lines[i].startsWith("CC ")) {
                surf.conic_constant = Number.parseFloat(arg);
            } else if (lines[i].startsWith("NXT ")) {
                surfaces.push(surf);
                surf = new Surface();
                surf.aperture_radius = 25; // TODO
            } else if (lines[i].startsWith("END ")) {
                break;
            } else {
                console.log("Ignoring " + lines[i]);
            }
            i += 1;
        }
        let result = new Design();
        result.surfaces = surfaces;
        return result;
    }

    addExamplePCXLens(focal_length, diameter, lens_material, air_material) {
        let front = new Surface();
        front.radius_of_curvature = (lens_material.refractiveIndex(this.center_wavelength) - air_material.refractiveIndex(this.center_wavelength)) * focal_length;
        front.radius_of_curvature = Math.round(front.radius_of_curvature * 100) / 100;
        front.aperture_radius = diameter / 2;
        front.material = lens_material;
        front.thickness = focal_length > 0 ? front.sag(diameter / 2) - front.sag(0) : 2;
        front.thickness = Math.round(front.thickness * 100) / 100;
        this.surfaces.push(front);
        let back = new Surface();
        back.radius_of_curvature = Infinity;
        back.aperture_radius = front.aperture_radius;
        back.material = air_material;
        back.thickness = 10; // TODO
        this.surfaces.push(back);
    }

    // result[1] is system equivalent power
    calculateMeyerArendtSystemMatrix() {
        let matrices = [];
        let last_medium = AIR_MATERIAL;
        for (let i = 0; i < this.surfaces.length; i += 1) {
            let surface = this.surfaces[i];
            const n1 = last_medium.refractiveIndex(this.center_wavelength);
            const n2 = surface.material.refractiveIndex(this.center_wavelength);
            const power = (n2 - n1) / surface.radius_of_curvature;
            const rm = [ 1, power,
                        0, 1 ];
            matrices.push(rm);
            if (i == this.surfaces.length - 1) { break; }
            const tm = [ 1, 0,
                       -surface.thickness/n2, 1 ];
            matrices.push(tm);
            last_medium = surface.material;
        }
        let result = [ 1, 0,
                       0, 1 ];
        for (let matrix of matrices) {
            result = matrix_2x2_multiply(result, matrix);
        }
        return result;
    }

    indexForSurface(s) {
        for (let i = 0; i < this.surfaces.length; i += 1) {
            if (s === this.surfaces[i]) {
                return i;
            }
        }
        throw "requested index of surface not present in design";
    }

    traceMarginalRayToImageDistance(limit) {
        if (!limit) { limit = 1; }
        const initial_radius = this.surfaces[0].aperture_radius / limit;
        let image_distance = 0;
        for (let w = 0; w < 1001; ++w) {
            let ray_o = [-50, w*(initial_radius/1000)];
            let ray_i = Surface.traceRay2D(ray_o[0], ray_o[1], 0, AIR_MATERIAL, this.surfaces[0]);

            let t_off = 0;
            for (var s = 1; s < this.surfaces.length; s += 1) {
                t_off += this.surfaces[s-1].thickness;
                let new_angle = ray_i[2];
                ray_o = [ray_i[0] - t_off, ray_i[1]];
                if (Math.abs(ray_o[1]) > this.surfaces[s-1].aperture_radius) {
                    break;
                }
                ray_i = Surface.traceRay2D(ray_o[0], ray_o[1], new_angle, this.surfaces[s-1].material, this.surfaces[s]);
                ray_i[0] += t_off;

                if (s == this.surfaces.length - 1) {
                    const x = ray_i[0];
                    const y = ray_i[1];
                    const m = ray_i[2];
                    const b = y - m*x;
                    // 0 = mx + b, x = -b/m
                    image_distance = -b/m;
                }
            }
        }
        return image_distance;
    }

    dbg_plotOpticalPathLengthBeforeImagePlane(limit) {
        if (!limit) { limit = this.surfaces[0].aperture_radius / this.env_beam_radius; }
        const initial_radius = this.surfaces[0].aperture_radius / limit;
        let opls = [];
        for (let w = 0; w < 201; ++w) {
            let opl = 0;
            //let ray_o = [-50, w*(initial_radius/100)];
            //let ray_i = Surface.traceRay2D(ray_o[0], ray_o[1], 0, AIR_MATERIAL, this.surfaces[0]);

            let ray_o = [-1000, 0];
            let slope = Math.atan(((w / 200) * initial_radius) / 1000);
            let ray_i = Surface.traceRay2D(ray_o[0], ray_o[1], slope, AIR_MATERIAL, this.surfaces[0]);

            opl += Vector.magnitude(Vector.sum(Vector.product(-1, ray_o), ray_i.slice(0,2))) * AIR_MATERIAL.refractiveIndex(this.center_wavelength);

            let t_off = 0;
            for (var s = 1; s < this.surfaces.length; s += 1) {
                t_off += this.surfaces[s-1].thickness;
                let new_angle = ray_i[2];
                ray_o = [ray_i[0] - t_off, ray_i[1]];
                if (Math.abs(ray_o[1]) > this.surfaces[s-1].aperture_radius) {
                    break;
                }
                ray_i = Surface.traceRay2D(ray_o[0], ray_o[1], new_angle, this.surfaces[s-1].material, this.surfaces[s]);
                opl += Vector.magnitude(Vector.sum(Vector.product(-1, ray_o), ray_i.slice(0,2))) * this.surfaces[s-1].material.refractiveIndex(this.center_wavelength);
                ray_i[0] += t_off;

                if (s == this.surfaces.length - 1) {
                    const x = ray_i[0];
                    const y = ray_i[1];
                    opls.push(opl);
                }
            }
        }
        // TODO dbg plot
        let i = 0;
        let opls_r = opls.slice();
        opls.reverse();
        opls = opls.concat(opls_r);
        let zero = opls[opls.length / 2];
        for (let opl of opls) {
            //opl -= zero;
            app.renderer.c.fillStyle = "black";
            //app.renderer.c.fillRect(i*5, 60, 4, opl*10);
            app.renderer.c.fillRect(10 + i*1, 60, 1, opl % 0.000587 * 200000);
            i += 1;
        }
    }

    distanceToVertexForSurface(n) {
        let d = 0;
        for (let i = 0; i < n; i += 1) {
            d += this.surfaces[i].thickness;
        }
        return d;
    }

    dbg_autofocus() {
        const limit = this.surfaces[0].aperture_radius / this.env_beam_radius;
        const img_dist = this.traceMarginalRayToImageDistance(limit);
        const si = this.surfaces.length - 1;
        const offset = this.distanceToVertexForSurface(si);
        this.surfaces[si].thickness = img_dist - offset;
        app.ui.writeDOMSurfaceTable();
        app.renderer.paint(app.design);
    }

    // traces rays from an object point through all surfaces
    // in the design sequentially
    // options:
    // * call_after_each_trace: a callback function invoked
    //   with a context object containing:
    //   * src_pt and dest_pt: the positions of the ray
    //     before and after the previous trace relative
    //     to the design origin
    //   * refract_dir: the direction vector that the
    //     refracted ray will follow next
    //   * medium: the medium across the previous trace
    // * append_surface: an additional surface to
    //   include after the design surfaces; if the
    //   thickness of the appended surface is non-zero,
    //   then the thickness of the final design surface
    //   before the appended surface will be overriden
    //   by the thickness of the appended surface
    // * continue_after_ray_miss: if true, the trace will
    //   proceed even after a ray misses a surface
    traceRayThroughSystem(obj_pt, ray_dir, options) {
        obj_pt = obj_pt.slice();
        ray_dir = ray_dir.slice();
        if (!options) { options = {}; }

        let pending_medium = this.env_initial_material;
        let pending_thickness = 0;
        let z = 0;
        const trace_surfaces = this.surfaces.slice();

        let appended_surface_thickness_override_index = -1;
        if (options.append_surface) {
            if (options.append_surface.thickness) {
                appended_surface_thickness_override_index = trace_surfaces.length - 1;
            }
            trace_surfaces.push(options.append_surface);
        }

        for (let i = 0; i < trace_surfaces.length; i += 1) {
            const surface = trace_surfaces[i];

            const trace_result = Surface.traceRay3D(obj_pt, ray_dir, pending_medium, surface);
            const intersection = trace_result[0]; // relative to surface vertex
            const refract_dir = trace_result[1];

            if (Vector.magnitude(intersection.slice(0, 2)) > surface.aperture_radius) {
                if (!options.continue_after_ray_miss) {
                    return null;
                }
            }

            if (options.call_after_each_trace) {
                let context = {
                    src_pt: Vector.sum(obj_pt, [0,0,z+pending_thickness]),
                    dest_pt: Vector.sum(intersection, [0,0,z+pending_thickness]),
                    medium: pending_medium,
                    refract_dir: refract_dir,
                };
                options.call_after_each_trace(context);
            }

            z += pending_thickness;
            pending_thickness = surface.thickness;
            pending_medium = surface.material;

            if (i == appended_surface_thickness_override_index) {
                pending_thickness = options.append_surface.thickness;
            }

            obj_pt = Vector.sum(intersection, [0,0,-pending_thickness]);
            ray_dir = refract_dir;
        }

        return;
    }
}
