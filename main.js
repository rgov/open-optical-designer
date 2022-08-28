"use strict";

class App {
    constructor() {
        this.design = new Design();
        this.renderer = null;
        this.materials = [];
        this.ui = new UI();
    }

    findMaterial(name) {
        for (let m of this.materials) {
            if (m.name == name || (m.alternate_name && m.alternate_name == name)) {
                return m;
            }
        }
        return null;
    }
}

let app = new App();

function saveJSONFile() {
    let json = JSON.stringify(app.design, (k, v) => {
        if (v instanceof Material) {
            return v.name;
        } else if (v == Infinity) {
            return "<INFINITY>";
        } else {
            return v;
        }
    });
    let file = new Blob([json], {type: "text/json"});
    let a = document.createElement("a");
    let url = URL.createObjectURL(file);
    a.href = url;
    a.download = "lens-design.json";
    a.click();
    URL.revokeObjectURL(url);
}

async function loadJSONFile(e) {
    let file = e.target.files[0];
    if (!file) { return null; }
    let text = await file.text();
    let json = JSON.parse(text, (k, v) => {
        if (typeof k == 'string') {
            if (k == "material" || k.endsWith("_material")) {
                return app.findMaterial(v);
            } else if ((k == "radius_of_curvature" && v == null) || v == "<INFINITY>") {
                return Infinity;
            } else if (k == "surfaces" && Array.isArray(v)) {
                return v.map(x => {
                    return Object.assign(new Surface(), x);
                });
            }
        }
        return v;
    });
    return json;
}

function registerButtons() {
    document.getElementById("surface-table-add-after-button").onclick = () => { app.ui.surfaceTableAddRowAfter(); };
    document.getElementById("surface-table-add-before-button").onclick = () => { app.ui.surfaceTableAddRowBefore(); };
    document.getElementById("surface-table-delete-button").onclick = () => { app.ui.surfaceTableDeleteRow(); };

    document.getElementById("btn-import-len-file").onchange = async (e) => {
        let result = await Design.importLenFile(e);
        if (result) {
            app.design = result;
            app.ui.selected_surface_number = 1;
            app.ui.center_pane_view_mode = 'design2d';
            app.ui.writeDOMSurfaceTable();
            app.ui.writeDOMEnvironmentControl();
            app.renderer.paint(app.design);
        } else {
            alert('import failed');
        }
    };
    document.getElementById("btn-save-json-file").onclick = () => {
        saveJSONFile();
    };
    document.getElementById("btn-load-json-file").onchange = async (e) => {
        let json = await loadJSONFile(e);
        app.design = new Design();
        Object.assign(app.design, json);
        app.ui.selected_surface_number = 1;
        app.ui.center_pane_view_mode = 'design2d';
        app.ui.writeDOMSurfaceTable();
        app.ui.writeDOMEnvironmentControl();
        app.renderer.paint(app.design);
    };

    let select_center_view = document.getElementById("select-center-view");
    select_center_view.onchange = () => {
        app.ui.center_pane_view_mode = select_center_view.options[select_center_view.selectedIndex].value;
        app.renderer.paint(app.design);
    };
}

function main() {
    registerButtons();
    loadMaterialData();
    app.design.addExamplePCXLens(200, 75, app.findMaterial("PMMA"), AIR_MATERIAL);
    app.design.addExamplePCXLens(70, 55, app.findMaterial("PMMA"), AIR_MATERIAL);
    app.design.addExamplePCXLens(-100, 40, app.findMaterial("PMMA"), AIR_MATERIAL);
    app.design.surfaces[0].material = app.findMaterial("N-SF11");
    app.design.surfaces[2].material = app.findMaterial("N-BK7");
    app.design.surfaces[4].material = app.findMaterial("N-SF11");
    app.design.surfaces[app.design.surfaces.length-1].thickness = 35;
    //app.design.addExamplePCXLens(100, 75, app.findMaterial("PMMA"), AIR_MATERIAL);
    //app.design.surfaces[0].conic_constant = -1;
    app.ui.writeDOMSurfaceTable();
    app.ui.writeDOMEnvironmentControl();
    recreateMainCanvas();
}

function loadMaterialData() {
    for (let material_datum of MATERIAL_DATA) {
        app.materials.push(Material.fromJSON(material_datum));
    }
}

function recreateMainCanvas() {
    let canvas = document.getElementById("main-canvas");
    app.renderer = new TestRenderer(canvas);
    app.renderer.paint(app.design);
}

onload = () => {
    main();
};
onresize = () => {
    recreateMainCanvas();
};
window.visualViewport.onresize = () => {
    recreateMainCanvas();
};
