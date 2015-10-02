'use strict';

const request = require('request');
const _ = require('lodash');
const merge = require('deepmerge');
const fs = require('fs');

const url = 'http://px.hagstofa.is/pxis/api/v1/is/Efnahagur/utanrikisverslun/1_voruvidskipti/4_utflutningur/UTA02115.px';

const yearMapper = (value) => value + 1999;

const query = {
    "query": [
        {"code":"Ár", "selection":{"filter":"all", "values":["*"]}},
        {"code":"Vöruflokkar", "selection":{ "filter":"all", "values":["*"]}},
        {"code":"Markaðssvæði", "selection":{ "filter":"all", "values":["*"]}},
        {"code":"Eining", "selection":{ "filter":"item", "values":["0"]}}
    ],
    "response": {"format":"json"}
};

request({url: url, json: true}, (err, res, body) => {
  const chartTitle = body.title;
  const variables = body.variables;
  const valueToText = (value, code) => {
    // console.log(value, code);
    const variable = _.find(variables, item => item.code == code);
    const valueIndex = _.indexOf(variable.values, value);
    return variable.valueTexts[valueIndex];
  };
  const itemGroups = variables[1];
  const getItemGroupFor = (startIndex) => {
    const indexInt = Number(startIndex);
    if (_.isNaN(parseInt(itemGroups.valueTexts[indexInt]))) {
      // No item group available for e.g. 'Iðnaðarvörur'
      return null;
    }
    for (let i = indexInt - 1; i >= 1; i--) {
      if (_.isNaN(parseInt(itemGroups.valueTexts[i]))) {
        // Only true if the text starts with a number,
        // e.g. '112 Sild'. False if e.g. 'Fiskur'
        return itemGroups.valueTexts[i];
      }
    }
  };
  // console.log(itemGroups);
  // console.log(getItemGroupFor(4)); // returns 'Sjávarafurðir'
  // console.log(valueToText('13', 'Vöruflokkar')); // returns '125 Langa' 

  request.post({ url: url, json: query, encoding: 'utf8' }, (err, res, body) => {
    const data = body.data;
    const dataByYear = data.reduce((acc, dataEntry) => {
      const year = Number(dataEntry.key[0]) + 1999;
      if (acc[year]) {
        acc[year].push(dataEntry);
      } else {
        acc[year] = [dataEntry];
      }
      return acc;
    }, {})

    let overallResult = { name: 'Útflutningur', children: []};
    _.forEach(dataByYear, (data, year) => {
      // let yearResult = { name: 'Útflutningur', children: []};
      _.forEach(data, dataCell => {
        // console.log(dataCell);
        const itemName = valueToText(dataCell.key[1], 'Vöruflokkar');
        const marketArea = valueToText(dataCell.key[2], 'Markaðssvæði');
        const itemGroup = getItemGroupFor(dataCell.key[1]);
        const value = Number(dataCell.values[0]);
        if (itemGroup && marketArea !== 'Alls') {
          insertInto(overallResult, itemGroup, itemName, marketArea, value, year);
        }
      });
      // overallResult[year] = yearResult;
    });
    fs.writeFileSync('../utflutningur_2_with_zeroes.json', JSON.stringify(overallResult, null, 4));
  });
});

function insertInto(result, itemGroup, itemName, marketArea, value, year) {
  const groupIndex = _.findIndex(result.children, group => group.name == itemGroup);
  if (groupIndex !== -1) {
    const itemIndex = _.findIndex(result.children[groupIndex].children, 
      item => item.name == itemName);
    if (itemIndex !== -1) {
      const marketIndex = _.findIndex(result.children[groupIndex].children[itemIndex].children,
        market => market.name == marketArea);
      if (marketIndex !== -1) {
        result.children[groupIndex]
              .children[itemIndex]
              .children[marketIndex][year] = value;
      } else {
        result.children[groupIndex]
            .children[itemIndex]
            .children
            .push({ name: marketArea, [year]: value });
      }
    } else {
      result.children[groupIndex].children.push({ name: itemName, children: []});
      insertInto(result, itemGroup, itemName, marketArea, value, year);
    }
  } else {
    result.children.push({ name: itemGroup, children: []});
    insertInto(result, itemGroup, itemName, marketArea, value, year);
  }
}


// [
//     { //dataentry
//       "key": [
//         "0", Ár 1999
//         "0", Vöruflokkur
//         "0", Markaðssvæði
//         "0" Eining (alltaf 0)
//       ],
//       "values": [
//         "101421.9"
//       ]
//     },
//     {
//       "key": [
//         "0",
//         "0",
//         "1",
//         "0"
//       ],
//       "values": [
//         "8288.2"
//       ]
//     }
// ] 