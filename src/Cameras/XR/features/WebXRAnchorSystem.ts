import { WebXRFeature, WebXRFeaturesManager } from '../webXRFeaturesManager';
import { WebXRSessionManager } from '../webXRSessionManager';
import { Observable, Observer } from '../../../Misc/observable';
import { Matrix } from '../../../Maths/math.vector';
import { TransformNode } from '../../../Meshes/transformNode';
import { WebXRPlaneDetector } from './WebXRPlaneDetector';
import { Nullable } from '../../../types';
import { WebXRHitTestLegacy } from './WebXRHitTestLegacy';

const Name = "xr-anchor-system";

/**
 * Configuration options of the anchor system
 */
export interface WebXRAnchorSystemOptions {
    /**
     * a node that will be used to convert local to world coordinates
     */
    worldParentNode?: TransformNode;
    /**
     * should the anchor system use plane detection.
     * If set to true, the plane-detection feature should be set using setPlaneDetector
     */
    usePlaneDetection?: boolean;
    /**
     * Should a new anchor be added every time a select event is triggered
     */
    addAnchorOnSelect?: boolean;
}

/**
 * A babylon container for an XR Anchor
 */
export interface WebXRAnchor {
    /**
     * A babylon-assigned ID for this anchor
     */
    id: number;
    /**
     * The native anchor object
     */
    xrAnchor: XRAnchor;
    /**
     * Transformation matrix to apply to an object attached to this anchor
     */
    transformationMatrix: Matrix;
}

let anchorIdProvider = 0;

/**
 * An implementation of the anchor system of WebXR.
 * Note that the current documented implementation is not available in any browser. Future implementations
 * will use the frame to create an anchor and not the session or a detected plane
 * For further information see https://github.com/immersive-web/anchors/
 */
export class WebXRAnchorSystem implements WebXRFeature {

    /**
     * The module's name
     */
    public static readonly Name = Name;
    /**
     * The (Babylon) version of this module.
     * This is an integer representing the implementation version.
     * This number does not correspond to the webxr specs version
     */
    public static readonly Version = 1;

    /**
     * Observers registered here will be executed when a new anchor was added to the session
     */
    public onAnchorAddedObservable: Observable<WebXRAnchor> = new Observable();
    /**
     * Observers registered here will be executed when an existing anchor updates
     * This can execute N times every frame
     */
    public onAnchorUpdatedObservable: Observable<WebXRAnchor> = new Observable();
    /**
     * Observers registered here will be executed when an anchor was removed from the session
     */
    public onAnchorRemovedObservable: Observable<WebXRAnchor> = new Observable();

    private _planeDetector: WebXRPlaneDetector;
    private _hitTestModule: WebXRHitTestLegacy;

    private _enabled: boolean = false;
    private _attached: boolean = false;
    private _trackedAnchors: Array<WebXRAnchor> = [];
    private _lastFrameDetected: XRAnchorSet = new Set();
    private _observerTracked: Nullable<Observer<XRFrame>>;

    /**
     * constructs a new anchor system
     * @param xrSessionManager an instance of WebXRSessionManager
     * @param options configuration object for this feature
     */
    constructor(private xrSessionManager: WebXRSessionManager, private options: WebXRAnchorSystemOptions = {}) {
    }

    /**
     * set the plane detector to use in order to create anchors from frames
     * @param planeDetector the plane-detector module to use
     * @param enable enable plane-anchors. default is true
     */
    public setPlaneDetector(planeDetector: WebXRPlaneDetector, enable: boolean = true) {
        this._planeDetector = planeDetector;
        this.options.usePlaneDetection = enable;
    }

    /**
     * If set, it will improve performance by using the current hit-test results instead of executing a new hit-test
     * @param hitTestModule the hit-test module to use.
     */
    public setHitTestModule(hitTestModule: WebXRHitTestLegacy) {
        this._hitTestModule = hitTestModule;
    }

    /**
     * attach this feature
     * Will usually be called by the features manager
     *
     * @returns true if successful.
     */
    attach(): boolean {
        this._observerTracked = this.xrSessionManager.onXRFrameObservable.add(() => {
            const frame = this.xrSessionManager.currentFrame;
            if (!this._attached || !this._enabled || !frame) { return; }
            // const timestamp = this.xrSessionManager.currentTimestamp;

            const trackedAnchors = frame.trackedAnchors;
            if (trackedAnchors && trackedAnchors.size) {
                this._trackedAnchors.filter((anchor) => !trackedAnchors.has(anchor.xrAnchor)).map((anchor) => {
                    const index = this._trackedAnchors.indexOf(anchor);
                    this._trackedAnchors.splice(index, 1);
                    this.onAnchorRemovedObservable.notifyObservers(anchor);
                });
                // now check for new ones
                trackedAnchors.forEach((xrAnchor) => {
                    if (!this._lastFrameDetected.has(xrAnchor)) {
                        const newAnchor: Partial<WebXRAnchor> = {
                            id: anchorIdProvider++,
                            xrAnchor: xrAnchor
                        };
                        const plane = this.updateAnchorWithXRFrame(xrAnchor, newAnchor, frame);
                        this._trackedAnchors.push(plane);
                        this.onAnchorAddedObservable.notifyObservers(plane);
                    } else {
                        // updated?
                        if (xrAnchor.lastChangedTime === this.xrSessionManager.currentTimestamp) {
                            let index = this.findIndexInAnchorArray(xrAnchor);
                            const anchor = this._trackedAnchors[index];
                            this.updateAnchorWithXRFrame(xrAnchor, anchor, frame);
                            this.onAnchorUpdatedObservable.notifyObservers(anchor);
                        }
                    }
                });
                this._lastFrameDetected = trackedAnchors;
            }
        });

        if (this.options.addAnchorOnSelect) {
            this.xrSessionManager.session.addEventListener('select', this.onSelect, false);
        }

        this._attached = true;
        return true;
    }

    /**
     * detach this feature.
     * Will usually be called by the features manager
     *
     * @returns true if successful.
     */
    detach(): boolean {
        this._attached = false;

        this.xrSessionManager.session.removeEventListener('select', this.onSelect);

        if (this._observerTracked) {
            this.xrSessionManager.onXRFrameObservable.remove(this._observerTracked);
        }

        return true;
    }

    /**
     * Dispose this feature and all of the resources attached
     */
    dispose(): void {
        this.detach();
        this.onAnchorAddedObservable.clear();
        this.onAnchorRemovedObservable.clear();
        this.onAnchorUpdatedObservable.clear();
    }

    private onSelect = (event: XRInputSourceEvent) => {
        if (!this.options.addAnchorOnSelect) {
            return;
        }
        const onResults = (results: XRHitResult[]) => {
            if (results.length) {
                const hitResult = results[0];
                const transform = new XRRigidTransform(hitResult.hitMatrix);
                // find the plane on which to add.
                this.addAnchorAtRigidTransformation(transform);
            }
        };

        // avoid the hit-test, if the hit-test module is defined
        if (this._hitTestModule && !this._hitTestModule.options.testOnPointerDownOnly) {
            onResults(this._hitTestModule.lastNativeXRHitResults);
        }
        WebXRHitTestLegacy.XRHitTestWithSelectEvent(event, this.xrSessionManager.referenceSpace).then(onResults);

        // API will soon change, will need to use the plane
        this._planeDetector;
    }

    /**
     * Add anchor at a specific XR point.
     *
     * @param xrRigidTransformation xr-coordinates where a new anchor should be added
     * @param anchorCreator the object o use to create an anchor with. either a session or a plane
     * @returns a promise the fulfills when the anchor was created
     */
    public addAnchorAtRigidTransformation(xrRigidTransformation: XRRigidTransform, anchorCreator?: XRAnchorCreator): Promise<XRAnchor> {
        const creator = anchorCreator || this.xrSessionManager.session;
        return creator.createAnchor(xrRigidTransformation, this.xrSessionManager.referenceSpace);
    }

    private updateAnchorWithXRFrame(xrAnchor: XRAnchor, anchor: Partial<WebXRAnchor>, xrFrame: XRFrame): WebXRAnchor {
        // matrix
        const pose = xrFrame.getPose(xrAnchor.anchorSpace, this.xrSessionManager.referenceSpace);
        if (pose) {
            const mat = anchor.transformationMatrix || new Matrix();
            Matrix.FromArrayToRef(pose.transform.matrix, 0, mat);
            if (!this.xrSessionManager.scene.useRightHandedSystem) {
                mat.toggleModelMatrixHandInPlace();
            }
            anchor.transformationMatrix = mat;
            if (!this.options.worldParentNode) {
                // Logger.Warn("Please provide a world parent node to apply world transformation");
            } else {
                mat.multiplyToRef(this.options.worldParentNode.getWorldMatrix(), mat);
            }
        }

        return <WebXRAnchor>anchor;
    }

    /**
     * avoiding using Array.find for global support.
     * @param xrAnchor the plane to find in the array
     */
    private findIndexInAnchorArray(xrAnchor: XRAnchor) {
        for (let i = 0; i < this._trackedAnchors.length; ++i) {
            if (this._trackedAnchors[i].xrAnchor === xrAnchor) {
                return i;
            }
        }
        return -1;
    }

}

//register the plugin
WebXRFeaturesManager.AddWebXRFeature(WebXRAnchorSystem.Name, (xrSessionManager, options) => {
    return () => new WebXRAnchorSystem(xrSessionManager, options);
}, WebXRAnchorSystem.Version);