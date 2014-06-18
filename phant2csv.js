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

var sites = [];
try {
  //var csvRecs = csv.parseCSV("a,b,c\n1,2,3");
  var records = csv.parseCSV(csvFile);

  var skipRows = -1;
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

  sites = csv_to_obj(records.slice(skipRows));
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

// Debugging Setup
function checkExpDebug(def) {
    var debug = false;
//    if (def.pattern.indexOf("UA") >= 0 || def.pattern.indexOf("GTM") >= 0) {
//	debug = true;
//    }
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
	//
        // HERE is the ISSUE.  We must know the exact number for which we are searching.
        // So, our task is to modify this to find a variable number of items, or just 
        // ignore it.
        //
        if ( def.hit != undefined ) {
          result = def.hit;
          var hasSeparator = (def.separator != undefined?true:false);
          for (var k = 0; k < match.length; k++ ) {
	      if (!hasSeparator) {
                 result = result.replace('\{\{' + k + '\}\}', match[k]);
              } else {
                  result = (result.length>0?result + def.separator + match[k]:match[k])
              }
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
console.log(rows.join("\n"));

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

