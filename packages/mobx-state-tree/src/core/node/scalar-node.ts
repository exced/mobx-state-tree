import { computed, getAtom } from "mobx"
import {
    INode,
    toJSON,
    escapeJsonPath,
    addHiddenFinalProp,
    fail,
    freeze,
    IType,
    NodeLifeCycle,
    noop,
    ObjectNode
} from "../../internal"

export class ScalarNode implements INode {
    readonly type: IType<any, any>
    readonly storedValue: any
    subpath: string = ""

    private readonly _parent: ObjectNode | null

    readonly _environment: any = undefined
    private state = NodeLifeCycle.INITIALIZING

    constructor(
        type: IType<any, any>,
        parent: ObjectNode | null,
        subpath: string,
        environment: any,
        initialValue: any,
        storedValue: any,
        canAttachTreeNode: boolean,
        finalizeNewInstance: (node: INode, initialValue: any) => void = noop
    ) {
        this.type = type
        this.storedValue = storedValue
        this._parent = parent
        this.subpath = subpath
        this.storedValue = storedValue
        this._environment = environment

        if (canAttachTreeNode) addHiddenFinalProp(this.storedValue, "$treenode", this)

        let sawException = true
        try {
            if (canAttachTreeNode) addHiddenFinalProp(this.storedValue, "toJSON", toJSON)

            finalizeNewInstance(this, initialValue)

            this.state = NodeLifeCycle.CREATED
            sawException = false
        } finally {
            if (sawException) {
                // short-cut to die the instance, to avoid the snapshot computed starting to throw...
                this.state = NodeLifeCycle.DEAD
            }
        }
    }

    /*
     * Returnes (escaped) path representation as string
     */
    @computed
    public get path(): string {
        if (!this.parent) return ""
        return this.parent.path + "/" + escapeJsonPath(this.subpath)
    }

    public get isRoot(): boolean {
        return this.parent === null
    }

    public get parent(): ObjectNode | null {
        return this._parent
    }

    public get root(): ObjectNode {
        // future optimization: store root ref in the node and maintain it
        if (!this._parent) return fail(`This scalar node is not part of a tree`)
        return this._parent.root
    }

    setParent(newParent: INode | null, subpath: string | null = null) {
        if (this.parent !== newParent) fail(`Cannot change parent of immutable node`)
        if (this.subpath === subpath) return
        this.subpath = subpath || ""
        this._invalidateComputed("path")
    }

    public get value(): any {
        return this.type.getValue(this)
    }

    public get snapshot() {
        const snapshot = this.type.getSnapshot(this)
        // avoid any external modification in dev mode
        return freeze(snapshot)
    }

    public get isAlive() {
        return this.state !== NodeLifeCycle.DEAD
    }

    toString(): string {
        return `${this.type.name}@${this.path || "<root>"}${this.isAlive ? "" : "[dead]"}`
    }

    die() {
        this.state = NodeLifeCycle.DEAD
    }

    private _invalidateComputed(prop: string) {
        const atom = getAtom(this, prop) as any
        atom.trackAndCompute()
    }
}
