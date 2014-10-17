var fs = require('fs');
var U  = require('underscore');
var path = require('path');
var csv = require('finite-csv');
var program = require('commander');

program
  .version('0.0.1')
  .option('-d, --dataDir <path>', 'Data directory')
  .option('-x, --regexFile <path>', 'Regex file path')
  .option('-c, --csvFile <path>', 'CVS file containing site list')
  .option('-s, --skipRows [offset]', 'Number of rows to skip in the CSV file before the header.', parseInt, 0)
  .option('-m, --maxRows [count]', 'Max number of records to process.', parseInt, 100000)
  .option('-u, --urlColumn <name>', 'Max number of records to process.', 'url')
  .parse(process.argv);

//console.log(program);
//console.log('foo usage=' + program.usage);
if ( program.dataDir == undefined || program.regexFile == undefined || program.csvFile == undefined ) {
  program.help();
}

/* process the data directory */
if ( ! (fs.existsSync(program.dataDir) && fs.lstatSync(program.dataDir).isDirectory() ) ) {
  console.error('directory ' + program.dataDir + ' does not exist or is not a directory');
  process.exit(1);
}
var files = fs.readdirSync(program.dataDir);

/* process the regex file */
if ( ! fs.existsSync(program.regexFile) ) {
  console.error('json regex file ' + program.regexFile + ' does not exist');
  process.exit(1);
}
var regexFile = fs.readFileSync(program.regexFile, 'utf8');
var regexObj = null;
try {
  regexObj = JSON.parse(regexFile);
} catch (msg) {
  console.error("json regex file " + program.regexFile + " was not valid JSON.  Check out JSON lint online to validate it.");
  process.exit(1);
}

/* process the csv file */
if ( ! fs.existsSync(program.csvFile) ) {
  console.error('CSV file ' + program.csvFile + ' does not exist');
  process.exit(1);
}
var csvFile = fs.readFileSync(program.csvFile, 'utf8');
csvFile = csvFile.replace(/\cm[\r\n]*/g, "\n");

var skipRows = -1;
var sites = [];
try {
  //var csvRecs = csv.parseCSV("a,b,c\n1,2,3");
  var records = csv.parseCSV(csvFile);

  /* let's look for the header.  the header is the first row that contains a column with the urlColumn in it */
  outer:
  for ( var rI = 0; rI < records.length; rI++ ) {
    var record = records[rI];
    for ( var cI = 0; cI < record.length; cI++ ) {
      if ( record[cI] == program.urlColumn ) {
        skipRows = rI;
        break outer;
      }
    }
  }

  if ( skipRows < 0 ) {
    throw "Unable to find a row in the data with a column matching " + program.urlColumn;
  }

  skipRows = (program.skipRows == undefined?skipRows:program.skipRows);
//  sites = csv_to_obj((program.skipRows == undefined?records.slice(skipRows):
//                                        records.slice(program.skipRows)));
  sites = csv_to_obj(records);
  //console.log(sites);
  //console.log(sites[0]);
  sites = sites.slice(0,program.maxRows);
} catch (msg) {
  console.error("csv file " + program.csvFile + " was not valid CSV. " + msg);
  console.log(msg.stack);
  process.exit(1);
}

//console.log("site count=" + sites.length);

var rows = [];

// Load Header
for (var headerIndex=0; headerIndex < skipRows; headerIndex++) {
    rows.push(records[headerIndex]);
}

function convertCodeToState(code) {
    if (code == undefined) {
        return "Unknown";
    }
    if (code.match(/^(200|201|202|203|204|205|206)$/)) {
	return "Live";
    } else if (code.match(/^(300|301|302|303|304|305|306|307)$/)) {
        // Split the current domain, and let's see whether the current domain is
        // is related to the referring domain
        return "Redirect";
//        currentDomainElements = currentDomain.split(".");
//        currentBaseDomain = currentDomainElements[currentDomainElements.length - 1];
//        refDomainElements = refDomain.split(".");
//        refBaseDomain = refDomainElements[refDomainElements.length - 1];
//        if (currentBaseDomain == refBaseDomain) {
//            return "Live";
//        }
    } else if (code.match(/^(400|401|402|403|404|405|406|408|409|410|411|412|413|414|415|416|417)$/)) {
        return "Broken";
    } else if (code.match(/^(407)$/)) {
        return "Proxy Setupo Required";
    }
    return "Unknown";
}

// Debugging Setup
// If you want to debug everything, just have it return true.  Otherwise, 
// it is intended to only debug based on specific criteria being evaluated
//
function checkExpDebug(def) {
    var debug = false;
//    if (def.pattern.indexOf("UA") >= 0 || def.pattern.indexOf("GTM") >= 0) {
//	debug = true;
//    }
    if (def.pattern.indexOf("pageHttpCode") >= 0) {
	debug = true;
    }
    return debug;
}

function removeDuplicates(matches) {
   var newMatches = [];
   for (var i=0; i < matches.length; i++) {
       if (matches.lastIndexOf(matches[i]) == i) {
           // This is either Unique, or the last occurrence
           newMatches.push(matches[i]);
       }
   }
   return newMatches;
}

for ( var i = 0; i < sites.length; i++ ) {
  var enableDebug = false;
  var site = sites[i];
  //console.log("record [" + i + "] ", site[' URL ' ]);
  var file = U.filter(files, function(entry) {
    // the i+1 is due to a bug in the crawler
    return entry.indexOf('site_' + (i+1) + '_') == 0 && entry.match(/\.txt$/i);
  });

  var row = [];
  if ( file.length > 0 ) {
    var fullPath = program.dataDir + path.sep + file[0];
    var infile = fs.readFileSync(program.dataDir + path.sep + file[0], 'utf8');
    for (var key in regexObj) {
      var def = regexObj[key];
      var exp = new RegExp(def.pattern, def.modifiers);
      var match = infile.match(exp);
      var result = "";
      enableDebug = checkExpDebug(def)
      if (enableDebug) {
         console.log("checking " + def);
         console.log("checking " + def.pattern + ", modifier=" + def.modifiers);
      }
      //console.log("checking " + def.pattern + ", match=", match);
      if ( match ) {
        if (match.length > 1 && def.allowDups != undefined && def.allowDups == 'false') {
            match = removeDuplicates(match);
        }
        result = match[0];
        if (enableDebug) {
           console.log('KEY=' + key + " found " + match.length + " matches.");
        }
        if ( def.hit != undefined ) {
	  //
          // Our, our task is to modify this to find a variable number of items, or just 
          // ignore it.  Otherwise, the code will only match one  occurrence of items.
          //
          result = def.hit;
          var hasSeparator = (def.separator != undefined?true:false);
          for (var k = 0; k < match.length; k++ ) {
	      if (!hasSeparator) {
                 result = result.replace('\{\{' + k + '\}\}', match[k]);
              } else {
                  result = (result.length>0?result + def.separator + match[k]:match[k])
              }
          }
          if ("Page Http Status" == key) {
              if (enableDebug) {
                  console.log("checking " + key + " = " + result);
              }
              result = convertCodeToState(result);
          }
        }
        result = result.replace('\{\{count\}\}', match.length);
        if (enableDebug) {
           console.log('output=' + result);
        }
      } else {
        if ( def.miss != undefined ) {
          result = def.miss;
        }
      }
      row.push(result);
      if (enableDebug) {
         console.log(result + " == " + key);
      }
    }
    //console.log("processing file " + files[0]);
  } else {
    for ( var key in regexObj) {
      row.push("");
    }
    //console.log("no file found for site_" + (i+1) + "_...");
  }
  rows.push(row);
  //console.log('res=', row);
}

for ( var r = 0; r < rows.length; r++ ) {
  for ( var c = 0; c < rows[r].length; c++ ) {
    /* i'm going to remove all carriage returns here */
    rows[r][c] = rows[r][c].replace(/[\r\n]/g, " ");
    /* if we see a double quote then we will wrap the whole column with quotes and escape the quotes within */
    if ( rows[r][c].match(/[",]/) ) {
      rows[r][c] = '"' + rows[r][c].replace(/"/g, '""') + '"';
    }
  }
  rows[r] = rows[r].join(',');
}

rows.unshift(U.keys(regexObj));
fs.writeFileSync(program.csvFile + ".new", rows.join("\n"));
// console.log(rows.join("\n"));

/**
 * This awesome function will return an
 * array of rows with the key values of
 * each row matching the column header
 * which should be provided in the first row.
 */
function csv_to_obj(records) {
  var objects = [];
  var header = [];
  for ( var i = 0; i < records.length; i++ ) {
    var values = records[i];
    if ( i == 0 ) {
      header = values;
    } else {
      var item = [];
      for ( var recI = 0; recI < header.length; recI++ ) {
	item[header[recI]] = recI < values.length ? values[recI] : "";
      }
      objects.push(item);
    }
  }
  return objects;
}

function escapeRegExp(str) {
  return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

