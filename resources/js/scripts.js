//------------------------------------------------------------------------------------------
// Define helper classes
//------------------------------------------------------------------------------------------

/**
 * Class that stores information to help with replacing text based on user-inputted strings. Stuff 
 * from the "Macro Replacements" section of the webpage are parsed into these. Whether they're 
 * nameMacros or normalMacros is determined by the function parseMacros; both share the same 
 * structure.
 */
class Macro {
    constructor(inString, outString) {
        this.inString = inString;
        this.outString = outString;
        let escapedInString = escapeSpecialChars(inString);
        this.regInString = new RegExp(escapedInString, 'g');
        }
}

/**
 * Class used to help with replacing bold/italic tags. Handled as a class to help keep the state 
 * straight, so I don't write an opening tag when I mean to write a closing one.
 */
class ReplacementCount {
    constructor(frontTag, backTag) {
        this.count = 0;
        this.frontTag = frontTag;
        this.backTag = backTag;
    }

    get nextTag() {
        if (this.count % 2 === 0) {
            this.count++;
            return this.frontTag;
        }

        this.count++;
        return this.backTag;
    }
}

// Declare name of downloadable zip
let proxZip = undefined;

// Declare other global vars
let nameMacros = [];
let normalMacros = [];

//------------------------------------------------------------------------------------------
// Main functions
//------------------------------------------------------------------------------------------

/**
 * Sets everything up and starts the conversion process. Parses input, reads the files, creates an 
 * object for each map in memory, iterates through the object's events, and calls processPages on 
 * events' pages. processPages is where all of the actual changing happens.
 */
function convertFiles() {
    disableInput();
    // Read input files
    proxZip = new JSZip();
    parseMacros(nameMacros, normalMacros);
    let inFiles = document.getElementById("inputFiles").files;
    for (let i = 0, l = inFiles.length; i < l; i++) {
        let fileRead = new FileReader();
        fileRead.onload = function (a) {
            let fileName = inFiles[i].name;
            let raw = a.target.result;
            let parsedObj = JSON.parse(raw);
            //console.log(parsedObj);
            if (parsedObj) {
                let eventsObj = parsedObj.events;
                // Iterate through map's event objects
                for (let i = 0, l = eventsObj.length; i < l; i++) {
                    if (eventsObj[i]) {
                        if (eventsObj[i].pages) {
                            processPages(eventsObj[i].pages, fileName, eventsObj[i].id);
                        }
                    }
                }
                //console.log(parsedObj);
                addToOutFiles(fileName, parsedObj);
            }
        };

        fileRead.readAsText(inFiles[i]);
    }

    allowDownload();
}

/**
 * The function that actually changes the map object. Throw a function to change whatever it is 
 * you want changed in here. Pay attention to the order in which you do so!
 * @param {[Object]} pagesArray Array of page objects from an event.
 * @param {String} fileName Name of the map file. Used for more helpful error messages.
 * @param {Number} eventId Id of the event. Used for more helpful error messages.
 */
function processPages(pagesArray, fileName, eventId) {
    for (let i = 0, l = pagesArray.length; i < l; i++) {
        // Change macros
        let macrosEnabled = document.getElementById("macroEnabled").checked;
        let italicEnabled = document.getElementById("italicEnabled").checked;
        let boldEnabled = document.getElementById("boldEnabled").checked;
        if (macrosEnabled) {
            // Change name macros
            if (nameMacros.length > 0) {
                changeNames(pagesArray[i], true);
            }
            // Change normal macros
            if (normalMacros.length > 0) {
                changeMacros(pagesArray[i]);
            }
        }

        // Change names
        changeNames(pagesArray[i]);

        if (boldEnabled) {
            // Change bold
            changeFormatting(pagesArray[i], 'bold', fileName, eventId);
        }
        
        if (italicEnabled) {
            // Change italic
            changeFormatting(pagesArray[i], 'italic', fileName, eventId);
        }
    }
}

//------------------------------------------------------------------------------------------
// Message-specific functions
//------------------------------------------------------------------------------------------

/**
 * Changes names over to MZ's format. Can also remove an arbitrary string from the text block and
 * place something else in MZ's name slot, in case you (like me) used macros for putting up 
 * nameplates in MV. Note: this function - in either mode - only places something in the name
 * slot (and deletes the relevant string) if there isn't already something in the name slot.
 * @param {Object} page Page object from an event.
 * @param {Boolean=} macroFlag Optional "macro mode" flag. Boolean indicating if, instead of a name,
 * the function should look for a string from nameMacros, and if found, place user-inputted strings
 * in the name area. If true, the function will look in nameMacros for potential replacements, placing 
 * the first (and ONLY the first) occurrence in the name slot. If macroFlag is not supplied, the 
 * function will operate in its normal name mode.
 */
function changeNames(page, macroFlag) {
    let nameRe = /(?:\\n\<)(?<charName>.+)(?:\>)/i;
    let fullCode = /\\n\<.+\>/i;
    let list = page.list;
    let textBlocks = getTextBlocks(list);
    if (textBlocks) {
        textBlocks.forEach(function (tb) {
            let header = undefined;
            // Validate block
            if (tb[0] && tb[0].code == 101 && tb.length > 1) {
                header = tb[0];
            } else {
                badTextBlocks();
            }

            for (let i = 1, l = tb.length; i < l; i++) {
                // If you're using this in macro mode
                if (macroFlag) {
                    nameMacros.forEach(function (nm) {
                        // If you get a hit for a name macro regex
                        if (nm.regInString.test(tb[i].parameters[0])) {
                            let cName = nm.outString;
                            // If header doesn't already have a name, add it
                            if (header.parameters.length = 4) {
                                header.parameters.push(cName);
                                // And delete the matched text
                                tb[i].parameters[0] = tb[i].parameters[0].replace(nm.regInString, '');
                            }
                        }
                    });
                }                
                // Otherwise, you're using name mode
                // If you get a hit for a \n<Name>
                else if (nameRe.test(tb[i].parameters[0])) {
                    // Add the name to the header and delete the full code part of the string
                    let cName = tb[i].parameters[0].match(nameRe).groups.charName;
                    // If header doesn't already have a name, add it
                    if (header.parameters.length = 4) {
                        header.parameters.push(cName);
                        // And delete the full code
                        tb[i].parameters[0] = tb[i].parameters[0].replace(fullCode, '');
                    }
                }
            }
        });
    }
}

/**
 * Replaces instances of user-supplied string in text blocks with another string the user 
 * specifies. Has potential to cause all sorts of havoc if used improperly. Or if I wrote it 
 * poorly. Gets the aforementioned strings from normalMacros.
 * @param {Object} page Page object from an event.
 */
function changeMacros(page) {
    let list = page.list;
    let textBlocks = getTextBlocks(list);
    if (textBlocks) {
        textBlocks.forEach(function (tb) {
            // Validate block
            if (!tb[0] || tb[0].code != 101 || tb.length < 2) {
                badTextBlocks();
            }

            for (let i = 1, l = tb.length; i < l; i++) {
                normalMacros.forEach(function(nm) {
                    if (nm.regInString.test(tb[i].parameters[0])) {
                        tb[i].parameters[0] = tb[i].parameters[0].replace(nm.regInString, nm.outString);
                    }
                });
            }
        });
    }
}

/**
 * Reformats bold or italic text from the standard used in Yanfly's plugin to the much more 
 * sensible tags used in VisuStella's plugin.
 * @param {Object} page Page object from event.
 * @param {String} type Specifies whether the function should reformat either bold or italics.
 * String must be either 'bold' or 'italic' or the function will simply return.
 * @param {String} fileName Name of the map file this page is from. Used for more helpful error messages.
 * @param {Number} eventId Id of the event this page is from. Used for more helpful error messages.
 */
function changeFormatting(page, type, fileName, eventId) {
    // Validate input
    if (type != 'bold' && type != 'italic') {
        return;
    }

    let list = page.list;
    let textBlocks = getTextBlocks(list);
    if (textBlocks) {
        textBlocks.forEach(function(tb) {
            // Validate block
            if (!tb[0] || tb[0].code != 101 || tb.length < 2) {
                badTextBlocks();
            }

            let matchReg = undefined;
            let matchString = undefined;
            let frontTag = undefined;
            let backTag = undefined;
            if (type == 'bold') {
                matchReg = /\\fb/g;
                matchString = "\\fb";
                frontTag = "<b>"
                backTag = "</b>"
            } else {
                matchReg = /\\fi/g;
                matchString = "\\fi";
                frontTag = "<i>"
                backTag = "</i>"
            }

            let matchCount = 0;
            // Count matches in text block
            for (let i = 1, l = tb.length; i < l; i++) {
                let matches = tb[i].parameters[0].match(matchReg);
                if (matches) {
                    matchCount += matches.length;
                }
            }

            // If there aren't any matches, don't do anything
            if (matchCount === 0) {
                // This makes me feel like a baddie :(
            }
            // If matches are even, process block
            else if (matchCount % 2 === 0) {
                let replCount = new ReplacementCount(frontTag, backTag);
                for (let i = 1, l = tb.length; i < l; i++) {
                    let whoopsCount = 0;
                    while (matchReg.test(tb[i].parameters[0]) && whoopsCount < 1000) {
                        tb[i].parameters[0] = tb[i].parameters[0].replace(matchString, replCount.nextTag);
                        whoopsCount++;
                    }

                    if (whoopsCount >= 1000) {
                        infiniteLoop();
                    }
                }
            } else { // Else tell 'em something's jacked up
                formatError(fileName, eventId);
            }
        });
    }
}

/**
 * Takes a list input and turns it into an array of 'text blocks', each of which is meant to 
 * represent a single 'page' of text/dialogue in the game. For the purposes of this script,
 * a text block is an array of code objects beginning with a code 101 (the header) and otherwise 
 * composed of code 401s (lines of text.) Other code objects are ignored/excluded.
 * @param {Object} list The page's list array
 * @returns {[Text Block]} Returns an array of text blocks, which are themselves arrays of code 
 * objects. Returns undefined if the list didn't contain any valid text blocks.
 */
function getTextBlocks(list) {
    let outBlocks = [];
    let currentBlock = [];
    for (let i = 0, l = list.length; i < l; i++) {
        if (list[i].code == 101) {
            if (currentBlock.length > 0) {
                outBlocks.push(currentBlock);
            }

            currentBlock = [];
            currentBlock.push(list[i]);
        }
        else if (list[i].code == 401) {
            // Validate output
            if (currentBlock[0] && currentBlock[0].code == 101) {
                currentBlock.push(list[i]);
            } else {
                badTextBlocks();
            }
        } else {
            if (currentBlock.length > 0) {
                outBlocks.push(currentBlock);
                currentBlock = [];
            }
        }
    }

    if (outBlocks.length > 0) {
        return outBlocks;
    }

    return undefined;
}

/**
 * Populates the nameMacros and normalMacros arrays with objects representing user input from the
 * "Macro Replacements" section of the webpage.
 */
function parseMacros(nameMacros, normalMacros) {
    let macroList = document.getElementById("macroForms").children;
    for (let i = 0, l = macroList.length; i < l; i++) {
        let inString = macroList[i].children[0].firstChild.value;
        let outString = macroList[i].children[1].firstChild.value;
        let nameCheck = macroList[i].children[2].firstChild.checked;

        // If they put something into "String to replace" box
        if (inString) {
            // If it's a name replacement, construct nameMacros object
            if (nameCheck) {
                nameMacros.push(new Macro(inString, outString));
            } else { // Otherwise construct normalMacros object
                normalMacros.push(new Macro(inString, outString));
            }
        }
    }
}

/**
 * Lets user know there was a problem with the text blocks and throws an error.
 */
function badTextBlocks() {
    alert("There was a problem forming text blocks. Either your input is bad or the author of this script is.");
    throw new Error;
}

function formatError(fileName, eventId) {
    let msg = "There was a problem converting bold/italic formatting. Most likely you have an unclosed " 
    + "bold/italic. The error is from " + fileName + ", event " + eventId + ".";
    alert(msg);
    throw new Error;
}

function infiniteLoop() {
    alert("Tell Proxxie he got you stuck in an infinite loop in the format tag replacement part.");
    throw new Error;
}

//------------------------------------------------------------------------------------------
// I/O and various functions
//------------------------------------------------------------------------------------------

/**
 * Adds a file to the output zip representing a processed map.
 * @param {String} fileName What you want the file to be named.
 * @param {Object} parsedObj Processed map object.
 */
function addToOutFiles(fileName, parsedObj) {
    proxZip.file(fileName, JSON.stringify(parsedObj));
}

function download() {
    proxZip.generateAsync({type:"blob"})
    .then(function (blob) {
        saveAs(blob, "convertedMaps.zip");
    });
}

/**
 * Enables download button. Should be called when all maps are processed.
 */
function allowDownload() {
    document.getElementById("downloadButton").disabled = false;
}

/**
 * Disables input once user clicks "Convert Files" to prevent shenanigans.
 */
function disableInput() {
    Array.from(document.getElementsByClassName("input")).forEach(e => e.disabled = true);
}

function macroRadioChange() {
    if (document.getElementById("macroDisabled").checked) {
        Array.from(document.getElementsByClassName("macroInput")).forEach(e => e.disabled = true);
    } else {
        Array.from(document.getElementsByClassName("macroInput")).forEach(e => e.disabled = false);
    }
}

/**
 * Adds more macro input forms to the page
 */
function moreMacros() {
    for (let i = 0; i < 3; i++) {
        let container = document.createElement('div');
        container.classList.add("macro");
        let inDiv = document.createElement('div');
        container.appendChild(inDiv);
        inDiv.classList.add("macroIn");
        let inField = document.createElement('input');
        inField.type = "text";
        inField.name = "macroIn";
        inField.classList.add("input", "macroInput");
        inField.placeholder = "String to replace";
        inDiv.appendChild(inField);
        let outDiv = document.createElement('div');
        container.appendChild(outDiv);
        outDiv.classList.add("macroOut");
        let outField = document.createElement('input');
        outField.type = "text";
        outField.name = "macroOut";
        outField.classList.add("input", "macroInput");
        outField.placeholder = "Replacement string";
        outDiv.appendChild(outField);
        let nameDiv = document.createElement('div');
        container.appendChild(nameDiv);
        nameDiv.classList.add("macroName");
        let nameCheckbox = document.createElement('input');
        nameCheckbox.type = "checkbox";
        nameCheckbox.name = "macroName";
        nameCheckbox.classList.add("input", "macroInput");
        nameDiv.appendChild(nameCheckbox);
        document.getElementById("macroForms").appendChild(container);
    }
}

function escapeSpecialChars(inString) {
    let medString = inString.replace(/\W/g, "\\$&");
    return medString;
}

function reload() {
    location.reload();
}