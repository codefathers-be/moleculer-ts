"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const prettier_1 = __importDefault(require("prettier"));
const fs_1 = __importDefault(require("fs"));
const glob_1 = __importDefault(require("glob"));
const path_1 = __importDefault(require("path"));
const child_process_1 = __importDefault(require("child_process"));
const mustache_1 = __importDefault(require("mustache"));
const capitalize = (s) => {
    if (typeof s !== 'string') {
        return '';
    }
    return s.charAt(0).toUpperCase() + s.slice(1);
};
const servicesTemplate = fs_1.default.readFileSync(path_1.default.join(__dirname, 'templates', 'services.ts.mustache'), 'utf-8');
const brokerTemplate = fs_1.default.readFileSync(path_1.default.join(__dirname, 'templates', 'broker.ts.mustache'), 'utf-8');
const actionsParamsAssertTemplate = fs_1.default.readFileSync(path_1.default.join(__dirname, 'templates', 'actions.params.assert.ts.mustache'), 'utf-8');
const eventsParamsAssertTemplate = fs_1.default.readFileSync(path_1.default.join(__dirname, 'templates', 'events.params.assert.ts.mustache'), 'utf-8');
const rawMetaTemplate = fs_1.default.readFileSync(path_1.default.join(__dirname, 'templates/meta', 'raw.ts.mustache'), 'utf-8');
const namesMetaTemplate = fs_1.default.readFileSync(path_1.default.join(__dirname, 'templates/meta', 'names.ts.mustache'), 'utf-8');
async function formatAndSave(input, destination) {
    const info = await prettier_1.default.getFileInfo(destination);
    const options = (await prettier_1.default.resolveConfig(destination)) || undefined;
    if (options) {
        options.parser = info.inferredParser;
    }
    const output = await prettier_1.default.format(input, options);
    await new Promise((resolve, reject) => {
        fs_1.default.mkdir(path_1.default.dirname(destination), { recursive: true }, err => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
    await new Promise((resolve, reject) => {
        fs_1.default.writeFile(destination, output, err => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}
function getServiceTypeName(name) {
    const pureName = name
        .replace(/[^a-zA-Z0-9][a-zA-Z0-9]/g, one => one.charAt(0) + one.charAt(1).toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '');
    return `${capitalize(pureName)}ServiceTypes`;
}
function getRelativePathForImport(from, to) {
    return path_1.default.posix
        .relative(path_1.default.posix.normalize(from), path_1.default.posix.normalize(to))
        .replace(/\.ts$/, '');
}
async function rawMetaNames(services, outputDirImport) {
    // service types meta file content
    const metaFileContent = mustache_1.default.render(rawMetaTemplate, {
        serviceNames: services.map(({ name }) => getServiceTypeName(name)),
        outputDirImport,
    });
    const cpMeta = child_process_1.default.spawn(`${path_1.default.join('node_modules', '.bin', 'ts-node')}`, [
        '-e',
        metaFileContent,
    ]);
    let rawMeta = '';
    cpMeta.stdout.on('data', data => {
        rawMeta += data;
    });
    cpMeta.stderr.on('data', data => {
        console.error(`stderr: ${data}`);
    });
    await new Promise(resolve => {
        cpMeta.on('close', code => {
            resolve();
        });
    });
    const meta = JSON.parse(rawMeta);
    // broker action names
    const names = [];
    services.forEach(svc => {
        const { actionsLength, eventsLength } = meta[getServiceTypeName(svc.name)];
        names.push({
            name: getServiceTypeName(svc.name),
            actions: Array.from(Array(actionsLength).keys()),
            events: Array.from(Array(eventsLength).keys()),
        });
    });
    const metaNamesFileContent = mustache_1.default.render(namesMetaTemplate, {
        outputDirImport,
        names,
    });
    const cpMetaNames = child_process_1.default.spawn(`${path_1.default.join('node_modules', '.bin', 'ts-node')}`, ['-e', metaNamesFileContent]);
    let rawMetaNames = '';
    cpMetaNames.stdout.on('data', data => {
        rawMetaNames += data;
    });
    cpMetaNames.stderr.on('data', data => {
        console.error(`stderr: ${data}`);
    });
    await new Promise(resolve => {
        cpMetaNames.on('close', code => {
            resolve();
        });
    });
    return {
        meta,
        rawMetaNames: JSON.parse(rawMetaNames),
    };
}
async function generateBroker(options) {
    const isServiceName = options.isServiceName ||
        function (name) {
            return !Boolean(name.match(/^\$/));
        };
    const outputDirFs = path_1.default.normalize(options.outputDir);
    const outputDirImport = path_1.default.posix.normalize(options.outputDir);
    const serviceTypeFiles = glob_1.default.sync(options.serviceTypesPattern);
    const services = [];
    // init
    serviceTypeFiles.forEach(file => {
        const serviceRelativePath = getRelativePathForImport(options.outputDir, file);
        const service = require(file);
        const name = service.name;
        services.push({
            name,
            path: serviceRelativePath,
        });
    });
    // service types file content
    const serviceTypesFileContent = mustache_1.default.render(servicesTemplate, {
        services: services.map(({ path, name }) => {
            return {
                path,
                name: getServiceTypeName(name),
            };
        }),
    });
    await formatAndSave(serviceTypesFileContent, path_1.default.join(options.outputDir, 'services.types.ts'));
    const { meta, rawMetaNames: metaNames } = await rawMetaNames(services, outputDirImport);
    const callObj = {};
    const emitObj = {};
    // call
    services.forEach(svc => {
        const { actionsLength, eventsLength } = meta[getServiceTypeName(svc.name)];
        // actions GetCallParams/GetCallReturn
        for (let index = 0; index < actionsLength; index++) {
            const actionName = `${metaNames[`Services${getServiceTypeName(svc.name)}ActionsName${index}`]}`;
            const name = `${svc.name}.${actionName}`;
            if (callObj[name] !== undefined) {
                throw new Error(`Action ${name} multiple type definition detected.`);
            }
            callObj[name] = {
                actionName,
                name,
                index,
                type: getServiceTypeName(svc.name),
            };
        }
        // events GetEmitParams
        for (let index = 0; index < eventsLength; index++) {
            const eventName = `${metaNames[`Services${getServiceTypeName(svc.name)}EventsName${index}`]}`;
            const name = `${svc.name}.${eventName}`;
            if (emitObj[name] !== undefined) {
                throw new Error(`Event ${name} multiple type definition detected.`);
            }
            emitObj[name] = {
                eventName,
                name,
                index,
                type: getServiceTypeName(svc.name),
            };
        }
    });
    const brokerTypesFileContent = mustache_1.default.render(brokerTemplate, {
        callObj: Object.values(callObj),
        emitObj: Object.values(emitObj),
        ServiceNames: services
            .filter(({ name }) => isServiceName(name))
            .map(({ name }) => name),
        ServiceActionNames: Object.keys(callObj),
        ServiceEventNames: Object.keys(emitObj),
    });
    await formatAndSave(brokerTypesFileContent, path_1.default.join(outputDirFs, 'broker.types.ts'));
    if (options.generateActionsParamsAssert) {
        const servicesParamsAssertFileContent = mustache_1.default.render(actionsParamsAssertTemplate, {
            callObj: Object.values(callObj),
        });
        await formatAndSave(servicesParamsAssertFileContent, path_1.default.join(outputDirFs, 'actions.params.assert.ts'));
    }
    if (options.generateEventsParamsAssert) {
        const eventsParamsAssertFileContent = mustache_1.default.render(eventsParamsAssertTemplate, {
            emitObj: Object.values(emitObj),
        });
        await formatAndSave(eventsParamsAssertFileContent, path_1.default.join(outputDirFs, 'events.params.assert.ts'));
    }
}
exports.generateBroker = generateBroker;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvdXRpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSx3REFBZ0M7QUFDaEMsNENBQW9CO0FBQ3BCLGdEQUF3QjtBQUN4QixnREFBd0I7QUFDeEIsa0VBQStCO0FBQy9CLHdEQUFnQztBQWVoQyxNQUFNLFVBQVUsR0FBRyxDQUFDLENBQVMsRUFBRSxFQUFFO0lBQy9CLElBQUksT0FBTyxDQUFDLEtBQUssUUFBUSxFQUFFO1FBQ3pCLE9BQU8sRUFBRSxDQUFDO0tBQ1g7SUFDRCxPQUFPLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNoRCxDQUFDLENBQUM7QUFFRixNQUFNLGdCQUFnQixHQUFHLFlBQUUsQ0FBQyxZQUFZLENBQ3RDLGNBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFdBQVcsRUFBRSxzQkFBc0IsQ0FBQyxFQUN6RCxPQUFPLENBQ1IsQ0FBQztBQUVGLE1BQU0sY0FBYyxHQUFHLFlBQUUsQ0FBQyxZQUFZLENBQ3BDLGNBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFdBQVcsRUFBRSxvQkFBb0IsQ0FBQyxFQUN2RCxPQUFPLENBQ1IsQ0FBQztBQUVGLE1BQU0sMkJBQTJCLEdBQUcsWUFBRSxDQUFDLFlBQVksQ0FDakQsY0FBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsV0FBVyxFQUFFLG1DQUFtQyxDQUFDLEVBQ3RFLE9BQU8sQ0FDUixDQUFDO0FBRUYsTUFBTSwwQkFBMEIsR0FBRyxZQUFFLENBQUMsWUFBWSxDQUNoRCxjQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxXQUFXLEVBQUUsa0NBQWtDLENBQUMsRUFDckUsT0FBTyxDQUNSLENBQUM7QUFFRixNQUFNLGVBQWUsR0FBRyxZQUFFLENBQUMsWUFBWSxDQUNyQyxj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