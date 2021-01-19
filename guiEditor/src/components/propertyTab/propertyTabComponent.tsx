import * as React from "react";
import { GlobalState } from "../../globalState";
import { Nullable } from "babylonjs/types";
import { ButtonLineComponent } from "../../sharedUiComponents/lines/buttonLineComponent";
import { LineContainerComponent } from "../../sharedUiComponents/lines/lineContainerComponent";
import { FileButtonLineComponent } from "../../sharedUiComponents/lines/fileButtonLineComponent";
import { Tools } from "babylonjs/Misc/tools";
import { CheckBoxLineComponent } from "../../sharedUiComponents/lines/checkBoxLineComponent";
import { DataStorage } from "babylonjs/Misc/dataStorage";
import { GUINode } from "../../diagram/guiNode";
import { Observer } from "babylonjs/Misc/observable";
import { TextLineComponent } from "../../sharedUiComponents/lines/textLineComponent";
import { StringTools } from "../../sharedUiComponents/stringTools";
import { Engine } from "babylonjs/Engines/engine";
import { LockObject } from "../../sharedUiComponents/tabs/propertyGrids/lockObject";
import { SliderPropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/sliderPropertyGridComponent";
import { Slider } from "babylonjs-gui/2D/controls/sliders/slider";
import { LinePropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/linePropertyGridComponent";
import { RadioButtonPropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/radioButtonPropertyGridComponent";

import { TextBlock } from "babylonjs-gui/2D/controls/textBlock";
import { InputText } from "babylonjs-gui/2D/controls/inputText";
import { ColorPicker } from "babylonjs-gui/2D/controls/colorpicker";
import { Image } from "babylonjs-gui/2D/controls/image";
import { ImageBasedSlider } from "babylonjs-gui/2D/controls/sliders/imageBasedSlider";
import { Rectangle } from "babylonjs-gui/2D/controls/rectangle";
import { Ellipse } from "babylonjs-gui/2D/controls/ellipse";
import { Checkbox } from "babylonjs-gui/2D/controls/checkbox";
import { RadioButton } from "babylonjs-gui/2D/controls/radioButton";
import { Line } from "babylonjs-gui/2D/controls/line";
import { ScrollViewer } from "babylonjs-gui/2D/controls/scrollViewers/scrollViewer";
import { Grid } from "babylonjs-gui/2D/controls/grid";
import { StackPanel } from "babylonjs-gui/2D/controls/stackPanel";
import { TextBlockPropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/textBlockPropertyGridComponent";
import { InputTextPropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/inputTextPropertyGridComponent";
import { ColorPickerPropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/colorPickerPropertyGridComponent";
import { ImagePropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/imagePropertyGridComponent";
import { ImageBasedSliderPropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/imageBasedSliderPropertyGridComponent";
import { RectanglePropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/rectanglePropertyGridComponent";
import { StackPanelPropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/stackPanelPropertyGridComponent";
import { GridPropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/gridPropertyGridComponent";
import { ScrollViewerPropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/scrollViewerPropertyGridComponent";
import { EllipsePropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/ellipsePropertyGridComponent";
import { CheckboxPropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/checkboxPropertyGridComponent";
import { Control } from "babylonjs-gui/2D/controls/control";
import { ControlPropertyGridComponent } from "../../sharedUiComponents/tabs/propertyGrids/gui/controlPropertyGridComponent";
import { AdvancedDynamicTexture } from "babylonjs-gui/2D/advancedDynamicTexture";

require("./propertyTab.scss");

interface IPropertyTabComponentProps {
    globalState: GlobalState;
}

interface IPropertyTabComponentState {
    currentNode: Nullable<GUINode>;
}

export class PropertyTabComponent extends React.Component<IPropertyTabComponentProps, IPropertyTabComponentState> {
    private _onBuiltObserver: Nullable<Observer<void>>;
    private _timerIntervalId: number;
    private _lockObject = new LockObject();
    constructor(props: IPropertyTabComponentProps) {
        super(props);

        this.state = { currentNode: null };
    }

    timerRefresh() {
        if (!this._lockObject.lock) {
            this.forceUpdate();
        }
    }

    componentDidMount() {
        this._timerIntervalId = window.setInterval(() => this.timerRefresh(), 500);
        this.props.globalState.onSelectionChangedObservable.add((selection) => {
            if (selection instanceof GUINode) {
                this.setState({ currentNode: selection });
            } else {
                this.setState({ currentNode: null });
            }
        });

        this._onBuiltObserver = this.props.globalState.onBuiltObservable.add(() => {
            this.forceUpdate();
        });
    }

    componentWillUnmount() {
        window.clearInterval(this._timerIntervalId);
        this.props.globalState.onBuiltObservable.remove(this._onBuiltObserver);
    }

    load(file: File) {
        Tools.ReadFile(
            file,
            (data) => {
                const decoder = new TextDecoder("utf-8");
                this.props.globalState.workbench.loadFromJson(JSON.parse(decoder.decode(data)));

                this.props.globalState.onSelectionChangedObservable.notifyObservers(null);
            },
            undefined,
            true
        );
    }

    save() {
        const json = JSON.stringify(this.props.globalState.guiTexture.serializeContent());
        StringTools.DownloadAsFile(this.props.globalState.hostDocument, json, "guiTexture.json");
    }

    saveToSnippetServer() {
        const adt = this.props.globalState.guiTexture;
        const content = JSON.stringify(adt.serializeContent());

        const xmlHttp = new XMLHttpRequest();
        xmlHttp.onreadystatechange = () => {
            if (xmlHttp.readyState == 4) {
                if (xmlHttp.status == 200) {
                    const snippet = JSON.parse(xmlHttp.responseText);
                    const oldId = adt.snippetId;
                    adt.snippetId = snippet.id;
                    if (snippet.version && snippet.version != "0") {
                        adt.snippetId += "#" + snippet.version;
                    }
                    this.forceUpdate();
                    if (navigator.clipboard) {
                        navigator.clipboard.writeText(adt.snippetId);
                    }

                    const windowAsAny = window as any;

                    if (windowAsAny.Playground && oldId) {
                        windowAsAny.Playground.onRequestCodeChangeObservable.notifyObservers({
                            regex: new RegExp(oldId, "g"),
                            replace: `parseFromSnippetAsync("${adt.snippetId}`,
                        });
                    }

                    alert("GUI saved with ID: " + adt.snippetId + " (please note that the id was also saved to your clipboard)");
                } else {
                    alert("Unable to save your GUI");
                }
            }
        };

        xmlHttp.open("POST", AdvancedDynamicTexture.SnippetUrl + (adt.snippetId ? "/" + adt.snippetId : ""), true);
        xmlHttp.setRequestHeader("Content-Type", "application/json");

        const dataToSend = {
            payload: JSON.stringify({
                gui: content,
            }),
            name: "",
            description: "",
            tags: "",
        };

        xmlHttp.send(JSON.stringify(dataToSend));
    }

    loadFromSnippet() {
        const snippedID = window.prompt("Please enter the snippet ID to use");

        if (!snippedID) {
            return;
        }
        this.props.globalState.workbench.loadFromSnippet(snippedID);
    }

    renderProperties() {
        const className = this.state.currentNode?.guiControl.getClassName();
        switch (className) {
            case "TextBlock": {
                const textBlock = this.state.currentNode?.guiControl as TextBlock;
                return <TextBlockPropertyGridComponent textBlock={textBlock} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "InputText": {
                const inputText = this.state.currentNode?.guiControl as InputText;
                return <InputTextPropertyGridComponent inputText={inputText} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "ColorPicker": {
                const colorPicker = this.state.currentNode?.guiControl as ColorPicker;
                return <ColorPickerPropertyGridComponent colorPicker={colorPicker} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "Image": {
                const image = this.state.currentNode?.guiControl as Image;
                return <ImagePropertyGridComponent image={image} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "Slider": {
                const slider = this.state.currentNode?.guiControl as Slider;
                return <SliderPropertyGridComponent slider={slider} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "ImageBasedSlider": {
                const imageBasedSlider = this.state.currentNode?.guiControl as ImageBasedSlider;
                return <ImageBasedSliderPropertyGridComponent imageBasedSlider={imageBasedSlider} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "Rectangle": {
                const rectangle = this.state.currentNode?.guiControl as Rectangle;
                return <RectanglePropertyGridComponent rectangle={rectangle} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "StackPanel": {
                const stackPanel = this.state.currentNode?.guiControl as StackPanel;
                return <StackPanelPropertyGridComponent stackPanel={stackPanel} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "Grid": {
                const grid = this.state.currentNode?.guiControl as Grid;
                return <GridPropertyGridComponent grid={grid} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "ScrollViewer": {
                const scrollViewer = this.state.currentNode?.guiControl as ScrollViewer;
                return <ScrollViewerPropertyGridComponent scrollViewer={scrollViewer} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "Ellipse": {
                const ellipse = this.state.currentNode?.guiControl as Ellipse;
                return <EllipsePropertyGridComponent ellipse={ellipse} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "Checkbox": {
                const checkbox = this.state.currentNode?.guiControl as Checkbox;
                return <CheckboxPropertyGridComponent checkbox={checkbox} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "RadioButton": {
                const radioButton = this.state.currentNode?.guiControl as RadioButton;
                return <RadioButtonPropertyGridComponent radioButton={radioButton} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
            case "Line": {
                const line = this.state.currentNode?.guiControl as Line;
                return <LinePropertyGridComponent line={line} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
            }
        }

        if (className !== "") {
            const control = this.state.currentNode?.guiControl as Control;
            return <ControlPropertyGridComponent control={control} lockObject={this._lockObject} onPropertyChangedObservable={this.props.globalState.onPropertyChangedObservable} />;
        }
        return null;
    }

    render() {
        if (this.state.currentNode) {
            return (
                <div id="propertyTab">
                    <div id="header">
                        <img id="logo" src="https://www.babylonjs.com/Assets/logo-babylonjs-social-twitter.png" />
                        <div id="title">GUI EDITOR</div>
                    </div>
                    {this.renderProperties()}
                </div>
            );
        }

        return (
            <div id="propertyTab">
                <div id="header">
                    <img id="logo" src="https://www.babylonjs.com/Assets/logo-babylonjs-social-twitter.png" />
                    <div id="title">GUI EDITOR</div>
                </div>
                <div>
                    <LineContainerComponent title="GENERAL">
                        <TextLineComponent label="Version" value={Engine.Version} />
                        <TextLineComponent label="Help" value="doc.babylonjs.com" underline={true} onLink={() => window.open("https://doc.babylonjs.com", "_blank")} />
                        <ButtonLineComponent
                            label="Reset to default"
                            onClick={() => {
                                this.props.globalState.onResetRequiredObservable.notifyObservers();
                            }}
                        />
                    </LineContainerComponent>
                    <LineContainerComponent title="OPTIONS">
                        <CheckBoxLineComponent
                            label="Show grid"
                            isSelected={() => DataStorage.ReadBoolean("ShowGrid", true)}
                            onSelect={(value: boolean) => {
                                DataStorage.WriteBoolean("ShowGrid", value);
                            }}
                        />
                    </LineContainerComponent>
                    <LineContainerComponent title="FILE">
                        <FileButtonLineComponent label="Load" onClick={(file) => this.load(file)} accept=".json" />
                        <ButtonLineComponent
                            label="Save"
                            onClick={() => {
                                this.save();
                            }}
                        />
                    </LineContainerComponent>
                    {
                        <LineContainerComponent title="SNIPPET">
                            <ButtonLineComponent label="Load from snippet server" onClick={() => this.loadFromSnippet()} />
                            <ButtonLineComponent
                                label="Save to snippet server"
                                onClick={() => {
                                    this.saveToSnippetServer();
                                }}
                            />
                        </LineContainerComponent>
                    }
                </div>
            </div>
        );
    }
}