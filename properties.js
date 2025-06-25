const backprops = [
  {
    "name": "Microtel Inn & Suites by Wyndham Kannapolis/Concord",
    "url": "https://www.expedia.com/Hotel-Search?destination=Concord%2C%20North%20Carolina%2C%20United%20States%20of%20America&regionId=7402&latLong=35.408752%2C-80.579513&flexibility=0_DAY&d1=2025-06-05&startDate=2025-06-23&d2=2025-06-06&endDate=2025-06-24&adults=2&rooms=1&hotelName=Microtel%20Inn%20%26%20Suites%20by%20Wyndham%20Kannapolis%2FConcord&selected=328797&sort=RECOMMENDED&isInvalidatedDate=true&upsellingNumNightsAdded=&th&theme=&userIntent=&semdtl=&upsellingDiscountTypeAdded=&categorySearch=&useRewards=false"
  },
  {
    "name": "Sleep Inn & Suites at Concord Mills",
    "url": "https://www.expedia.com/Hotel-Search?destination=Concord%2C%20North%20Carolina%2C%20United%20States%20of%20America&regionId=7402&latLong=35.408752%2C-80.579513&flexibility=0_DAY&d1=2025-06-05&startDate=2025-06-23&d2=2025-06-06&endDate=2025-06-24&adults=2&rooms=1&hotelName=Sleep%20Inn%20%26%20Suites%20at%20Concord%20Mills&selected=533926&sort=RECOMMENDED&isInvalidatedDate=false&upsellingNumNightsAdded=&th&theme=&userIntent=&semdtl=&upsellingDiscountTypeAdded=&categorySearch=&useRewards=false"
  },
  {
    "name": "Econo Lodge",
    "url": "https://www.expedia.com/Hotel-Search?destination=Concord%2C%20North%20Carolina%2C%20United%20States%20of%20America&regionId=7402&latLong=35.408752%2C-80.579513&flexibility=0_DAY&d1=2025-06-05&startDate=2025-06-23&d2=2025-06-06&endDate=2025-06-24&adults=2&rooms=1&hotelName=Econo%20Lodge&sort=RECOMMENDED&isInvalidatedDate=false&upsellingNumNightsAdded=&th&theme=&userIntent=&semdtl=&upsellingDiscountTypeAdded=&categorySearch=&useRewards=false&selected=8466"
  },
  {
    "name": "Sleep Inn Concord - Kannapolis",
    "url": "https://www.expedia.com/Hotel-Search?destination=Concord%2C%20North%20Carolina%2C%20United%20States%20of%20America&regionId=7402&latLong=35.408752%2C-80.579513&flexibility=0_DAY&d1=2025-06-05&startDate=2025-06-23&d2=2025-06-06&endDate=2025-06-24&adults=2&rooms=1&hotelName=Sleep%20Inn%20Concord%20-%20Kannapolis&sort=RECOMMENDED&isInvalidatedDate=false&upsellingNumNightsAdded=&th&theme=&userIntent=&semdtl=&upsellingDiscountTypeAdded=&categorySearch=&useRewards=false&selected=151309"
  },
  {
    "name": "Country Inn & Suites by Radisson, Concord (Kannapolis), NC",
    "url": "https://www.expedia.com/Hotel-Search?destination=Concord%2C%20North%20Carolina%2C%20United%20States%20of%20America&regionId=7402&latLong=35.408752%2C-80.579513&flexibility=0_DAY&d1=2025-06-05&startDate=2025-06-23&d2=2025-06-06&endDate=2025-06-24&adults=2&rooms=1&hotelName=Country%20Inn%20%26%20Suites%20by%20Radisson%2C%20Concord%20%28Kannapolis%29%2C%20NC&sort=RECOMMENDED&isInvalidatedDate=false&upsellingNumNightsAdded=&th&theme=&userIntent=&semdtl=&upsellingDiscountTypeAdded=&categorySearch=&useRewards=false&selected=3580997"
  },
  {
    "name": "Cabarrus Inn",
    "url": "https://www.expedia.com/Hotel-Search?destination=Concord%2C%20North%20Carolina%2C%20United%20States%20of%20America&regionId=7402&latLong=35.408752%2C-80.579513&flexibility=0_DAY&d1=2025-06-05&startDate=2025-06-23&d2=2025-06-06&endDate=2025-06-24&adults=2&rooms=1&hotelName=Cabarrus%20Inn&sort=RECOMMENDED&isInvalidatedDate=false&upsellingNumNightsAdded=&th&theme=&userIntent=&semdtl=&upsellingDiscountTypeAdded=&categorySearch=&useRewards=false&selected=57359013"
  },
  {
    "name": "Rodeway Inn",
    "url": "https://www.expedia.com/Hotel-Search?destination=Concord%2C%20North%20Carolina%2C%20United%20States%20of%20America&regionId=7402&latLong=35.408752%2C-80.579513&flexibility=0_DAY&d1=2025-06-05&startDate=2025-06-23&d2=2025-06-06&endDate=2025-06-24&adults=2&rooms=1&hotelName=Rodeway%20Inn&sort=RECOMMENDED&isInvalidatedDate=false&upsellingNumNightsAdded=&th&theme=&userIntent=&semdtl=&upsellingDiscountTypeAdded=&categorySearch=&useRewards=false&selected=7422"
  },
  {
    "name": "Spark by Hilton Kannapolis",
    "url": "https://www.expedia.com/Hotel-Search?destination=Concord%2C%20North%20Carolina%2C%20United%20States%20of%20America&regionId=7402&latLong=35.408752%2C-80.579513&flexibility=0_DAY&d1=2025-06-05&startDate=2025-06-23&d2=2025-06-06&endDate=2025-06-24&adults=2&rooms=1&sort=RECOMMENDED&isInvalidatedDate=false&upsellingNumNightsAdded=&th&theme=&userIntent=&semdtl=&upsellingDiscountTypeAdded=&categorySearch=&useRewards=false&hotelName=Spark%20by%20Hilton%20Kannapolis&selected=42708"
  },
  {
    "name": "Comfort Suites Concord Mills",
    "url": "https://www.expedia.com/Hotel-Search?destination=Concord%2C%20North%20Carolina%2C%20United%20States%20of%20America&regionId=7402&latLong=35.408752%2C-80.579513&flexibility=0_DAY&d1=2025-06-05&startDate=2025-06-23&d2=2025-06-06&endDate=2025-06-24&adults=2&rooms=1&sort=RECOMMENDED&isInvalidatedDate=false&upsellingNumNightsAdded=&th&theme=&userIntent=&semdtl=&upsellingDiscountTypeAdded=&categorySearch=&useRewards=false&hotelName=Comfort%20Suites%20Concord%20Mills&selected=912941"
  }
]

chrome.storage.local.set({ propertyLinks: backprops }, () => {
  console.log("✅ backupProps pushed to propertyLinks in local storage.");
});