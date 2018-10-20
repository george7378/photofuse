var PhotoFuse =
{
  fuseImages : function(images)
  {
    function PixelArray(width, height, channelsPerPixel)
    {
      this.width = width;
      this.height = height;
      this.channelsPerPixel = channelsPerPixel;
      
      this.data = [];
      for (var i = 0, lenI = this.width*this.height*this.channelsPerPixel; i < lenI; i++)
      {
        this.data.push(0);
      }
      
      this.getPixelData = function(x, y)
      {
        var pixelIndex = (y*this.width + x)*this.channelsPerPixel;

        var pixelData = [];
        for (var c = 0; c < this.channelsPerPixel; c++)
        {
          pixelData.push(this.data[pixelIndex + c]);
        }
        
        return pixelData;
      };
      
      this.setPixelData = function(x, y, pixelData)
      {
        var pixelIndex = (y*this.width + x)*this.channelsPerPixel;
        
        for (var c = 0; c < this.channelsPerPixel; c++)
        {
          this.data[pixelIndex + c] = pixelData[c];
        }
      };
      
      this.add = function(pixelArray)
      {
        if (pixelArray.width == this.width && pixelArray.height == this.height && pixelArray.channelsPerPixel == this.channelsPerPixel)
        {
          var addedPixelArray = new PixelArray(this.width, this.height, this.channelsPerPixel);
          for (var y = 0; y < this.height; y++)
          {
            for (var x = 0; x < this.width; x++)
            {
              var originalPixelData = this.getPixelData(x, y);
              var pixelDataToAdd = pixelArray.getPixelData(x, y);
              
              var addedPixelData = [];
              for (var c = 0; c < this.channelsPerPixel; c++)
              {
                addedPixelData.push(originalPixelData[c] + pixelDataToAdd[c]);
              }
              
              addedPixelArray.setPixelData(x, y, addedPixelData);
            }
          }
          
          return addedPixelArray;
        }
      };
      
      this.subtract = function(pixelArray)
      {
        if (pixelArray.width == this.width && pixelArray.height == this.height && pixelArray.channelsPerPixel == this.channelsPerPixel)
        {
          var subtractedPixelArray = new PixelArray(this.width, this.height, this.channelsPerPixel);
          for (var y = 0; y < this.height; y++)
          {
            for (var x = 0; x < this.width; x++)
            {
              var originalPixelData = this.getPixelData(x, y);
              var pixelDataToSubtract = pixelArray.getPixelData(x, y);

              var subtractedPixelData = [];
              for (var c = 0; c < this.channelsPerPixel; c++)
              {
                subtractedPixelData.push(originalPixelData[c] - pixelDataToSubtract[c]);
              }
              
              subtractedPixelArray.setPixelData(x, y, subtractedPixelData);
            }
          }
          
          return subtractedPixelArray;
        }
      };
      
      this.multiply = function(pixelArray)
      {
        if (pixelArray.width == this.width && pixelArray.height == this.height)
        {
          var multipliedPixelArray = new PixelArray(this.width, this.height, this.channelsPerPixel);
          for (var y = 0; y < this.height; y++)
          {
            for (var x = 0; x < this.width; x++)
            {
              var originalPixelData = this.getPixelData(x, y);
              var pixelDataToMultiply = pixelArray.getPixelData(x, y);
              
              var multipliedPixelData = [];
              for (var c = 0; c < this.channelsPerPixel; c++)
              {
                if (pixelArray.channelsPerPixel == 1)
                {
                  multipliedPixelData.push(originalPixelData[c]*pixelDataToMultiply[0]);
                }
                else if (pixelArray.channelsPerPixel == this.channelsPerPixel)
                {
                  multipliedPixelData.push(originalPixelData[c]*pixelDataToMultiply[c]);
                }
              }
              
              multipliedPixelArray.setPixelData(x, y, multipliedPixelData);
            }
          }
          
          return multipliedPixelArray;
        }
      };
      
      this.getFilteredArray = function()
      {
        // Horizontal gaussian filter
        var filteredArrayH = new PixelArray(this.width, this.height, this.channelsPerPixel);
        for (var y = 0; y < this.height; y++)
        {
          for (var x = 0; x < this.width; x++)
          {
            var pixelData = this.getPixelData(x, y);
            var pixelDataLeft = x > 0 ? this.getPixelData(x - 1, y) : pixelData;
            var pixelDataTwoLeft = x > 1 ? this.getPixelData(x - 2, y) : pixelDataLeft;
            var pixelDataRight = x < this.width - 1 ? this.getPixelData(x + 1, y) : pixelData;
            var pixelDataTwoRight = x < this.width - 2 ? this.getPixelData(x + 2, y) : pixelDataRight;
              
            var filteredPixelData = [];
            for (var c = 0; c < this.channelsPerPixel; c++)
            {
              filteredPixelData.push(0.0625*pixelDataTwoLeft[c] + 0.25*pixelDataLeft[c] + 0.375*pixelData[c] + 0.25*pixelDataRight[c] + 0.0625*pixelDataTwoRight[c]);
            }
            
            filteredArrayH.setPixelData(x, y, filteredPixelData);
          }
        }
  
        // Vertical gaussian filter on top of horizontal
        var filteredArrayHV = new PixelArray(this.width, this.height, this.channelsPerPixel);
        for (var y = 0; y < this.height; y++)
        {
          for (var x = 0; x < this.width; x++)
          {
            var pixelData = filteredArrayH.getPixelData(x, y);
            var pixelDataUp = y > 0 ? filteredArrayH.getPixelData(x, y - 1) : pixelData;
            var pixelDataTwoUp = y > 1 ? filteredArrayH.getPixelData(x, y - 2) : pixelDataUp;
            var pixelDataDown = y < this.height - 1 ? filteredArrayH.getPixelData(x, y + 1) : pixelData;
            var pixelDataTwoDown = y < this.height - 2 ? filteredArrayH.getPixelData(x, y + 2) : pixelDataDown;
            
            var filteredPixelData = [];
            for (var c = 0; c < this.channelsPerPixel; c++)
            {
              filteredPixelData.push(0.0625*pixelDataTwoUp[c] + 0.25*pixelDataUp[c] + 0.375*pixelData[c] + 0.25*pixelDataDown[c] + 0.0625*pixelDataTwoDown[c]);
            }
            
            filteredArrayHV.setPixelData(x, y, filteredPixelData);
          }
        }
        
        return filteredArrayHV;
      };
      
      this.getDownsampledArray = function()
      {
        var filteredArray = this.getFilteredArray();
      
        var downsampledArrayWidth = this.width % 2 == 0 ? this.width/2 : (this.width - 1)/2 + 1;
        var downsampledArrayHeight = this.height % 2 == 0 ? this.height/2 : (this.height - 1)/2 + 1;
        
        var downsampledArray = new PixelArray(downsampledArrayWidth, downsampledArrayHeight, this.channelsPerPixel);
        for (var y = 0; y < this.height; y += 2)
        {
          for (var x = 0; x < this.width; x += 2)
          {
            downsampledArray.setPixelData(x/2, y/2, filteredArray.getPixelData(x, y));
          }
        }
        
        return downsampledArray;
      };
      
      this.overlayPixelArray = function(startX, startY, pixelArray)
      {
        if (pixelArray.channelsPerPixel == this.channelsPerPixel)
        {
          for (var y = 0; y < pixelArray.height; y++)
          {
            for (var x = 0; x < pixelArray.width; x++)
            {
              this.setPixelData(startX + x, startY + y, pixelArray.getPixelData(x, y));
            }
          }
        }
      }
      
      this.getSubsetArray = function(startX, startY, endX, endY)
      {
        var subsetPixelData = [];
        for (var y = startY; y <= endY; y++)
        {
          for (var x = startX; x <= endX; x++)
          {
            subsetPixelData.push(this.getPixelData(x, y));
          }
        }
        
        var subsetPixelArray = new PixelArray(endX - startX + 1, endY - startY + 1, this.channelsPerPixel);
        for (var y = 0; y < subsetPixelArray.height; y++)
        {
          for (var x = 0; x < subsetPixelArray.width; x++)
          {
            subsetPixelArray.setPixelData(x, y, subsetPixelData[y*subsetPixelArray.width + x]);
          }
        }
        
        return subsetPixelArray;
      };
      
      this.getUpsampledArray = function(oddX, oddY)
      {
        // Create padded array
        var paddedArray = new PixelArray(this.width + 2, this.height + 2, this.channelsPerPixel);
        
        paddedArray.overlayPixelArray(1, 1, this);
        paddedArray.setPixelData(0, 0, this.getPixelData(0, 0));  // Top left corner
        paddedArray.setPixelData(paddedArray.width - 1, 0, this.getPixelData(this.width - 1, 0)); // Top right corner
        paddedArray.setPixelData(0, paddedArray.height - 1, this.getPixelData(0, this.height - 1)); // Bottom left corner
        paddedArray.setPixelData(paddedArray.width - 1, paddedArray.height - 1, this.getPixelData(this.width - 1, this.height - 1));  // Bottom right corner
        for (var x = 0; x < this.width; x++)  // Top and bottom bands
        {
          paddedArray.setPixelData(1 + x, 0, this.getPixelData(x, 0));
          paddedArray.setPixelData(1 + x, paddedArray.height - 1, this.getPixelData(x, this.height - 1));
        }
        for (var y = 0; y < this.height; y++)  // Left and right bands
        {
          paddedArray.setPixelData(0, 1 + y, this.getPixelData(0, y));
          paddedArray.setPixelData(paddedArray.width - 1, 1 + y, this.getPixelData(this.width - 1, y));
        }
        
        // Create upsampled array
        var upsampledArray = new PixelArray(2*paddedArray.width, 2*paddedArray.height, this.channelsPerPixel);
        for (var y = 0; y < upsampledArray.height; y += 2)
        {
          for (var x = 0; x < upsampledArray.width; x += 2)
          {
            var paddedPixelData = paddedArray.getPixelData(x/2, y/2);
            
            var paddedPixelDataMultiplied = [];
            for (var c = 0, lenC = paddedPixelData.length; c < lenC; c++)
            {
              paddedPixelDataMultiplied.push(4*paddedPixelData[c]);
            }
            
            upsampledArray.setPixelData(x, y, paddedPixelDataMultiplied);
          }
        }
        
        // Filter upsampled array, trim padding
        var filteredArray = upsampledArray.getFilteredArray();
        var trimmedArray = filteredArray.getSubsetArray(2, 2, filteredArray.width - 3 - oddX, filteredArray.height - 3 - oddY);
        
        return trimmedArray;
      };
      
      this.getGaussianPyramid = function(numberOfLevels)
      {
        var pyramid = [this];
      
        for (var l = 1; l < numberOfLevels; l++)
        {
          pyramid.push(pyramid[l - 1].getDownsampledArray());
        }
  
        return pyramid;
      };
      
      this.getLaplacianPyramid = function(numberOfLevels)
      {
        var pyramid = [];
      
        var currentArray = this;
        for (var l = 0; l < numberOfLevels - 1; l++)
        {
          var downsampledArray = currentArray.getDownsampledArray();
          
          var upsampleOddX = 2*downsampledArray.width - currentArray.width;
          var upsampleOddY = 2*downsampledArray.height - currentArray.height;
          var upsampledArray = downsampledArray.getUpsampledArray(upsampleOddX, upsampleOddY);
          
          pyramid.push(currentArray.subtract(upsampledArray));
          
          currentArray = downsampledArray;
        }
        pyramid.push(currentArray);
        
        return pyramid;
      };
    }
    
    
    function imageToRgb(image)
    {
      // Create canvas from image
      var canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;

      canvas.getContext("2d").drawImage(image, 0, 0);
      
      var data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      
      // Create RGB PixelArray from canvas
      var rgb = new PixelArray(canvas.width, canvas.height, 3);
      for (var y = 0; y < canvas.height; y++)
      {
        for (var x = 0; x < canvas.width; x++)
        {
          var dataIndex = (y*canvas.width + x)*4;
          
          rgb.setPixelData(x, y, [data[dataIndex], data[dataIndex + 1], data[dataIndex + 2]]);
        }
      }
      
      return rgb;
    }
    
    function createWeightMap(rgb, contrastExponent, saturationExponent, exposureExponent)
    {
      // Calculate grayscale values for contrast measure
      var grayscaleValues = new PixelArray(rgb.width, rgb.height, 1);
      for (var y = 0; y < rgb.height; y++)
      {
        for (var x = 0; x < rgb.width; x++)
        {
          var rgbPixelData = rgb.getPixelData(x, y);
          grayscaleValues.setPixelData(x, y, [0.2989*rgbPixelData[0] + 0.5870*rgbPixelData[1] + 0.1140*rgbPixelData[2]]);
        }
      }

      // Loop through pixels and calculate weight map value
      var weightMap = new PixelArray(rgb.width, rgb.height, 1);
      for (var y = 0; y < rgb.height; y++)
      {
        for (var x = 0; x < rgb.width; x++)
        {
          var weight = 1;

          // Calculate contrast measure
          if (contrastExponent > 0)
          {
            var grayscaleValue = grayscaleValues.getPixelData(x, y)[0];
            var grayscaleValueUp = y > 0 ? grayscaleValues.getPixelData(x, y - 1)[0] : grayscaleValue;
            var grayscaleValueDown = y < rgb.height - 1 ? grayscaleValues.getPixelData(x, y + 1)[0] : grayscaleValue;
            var grayscaleValueLeft = x > 0 ? grayscaleValues.getPixelData(x - 1, y)[0] : grayscaleValue;
            var grayscaleValueRight = x < rgb.width - 1 ? grayscaleValues.getPixelData(x + 1, y)[0] : grayscaleValue;
            
            var contrastMeasure = Math.abs(-4*grayscaleValue + grayscaleValueUp + grayscaleValueDown + grayscaleValueLeft + grayscaleValueRight);
            
            weight *= Math.pow(contrastMeasure, contrastExponent);
          }
          
          var rgbPixelData = rgb.getPixelData(x, y);

          // Calculate saturation measure
          if (saturationExponent > 0)
          {
            var pixelMean = (rgbPixelData[0] + rgbPixelData[1] + rgbPixelData[2])/3;
            var pixelVariance = (Math.pow(rgbPixelData[0] - pixelMean, 2) + Math.pow(rgbPixelData[1] - pixelMean, 2) + Math.pow(rgbPixelData[2] - pixelMean, 2))/3;
          
            var saturationMeasure = Math.sqrt(pixelVariance);
            
            weight *= Math.pow(saturationMeasure, saturationExponent);
          }

          // Calculate the exposure measure
          if (exposureExponent > 0)
          {
            var gaussIntensityRed = Math.exp(-Math.pow(rgbPixelData[0]/255 - 0.5, 2)/0.08);
            var gaussIntensityGreen = Math.exp(-Math.pow(rgbPixelData[1]/255 - 0.5, 2)/0.08);
            var gaussIntensityBlue = Math.exp(-Math.pow(rgbPixelData[2]/255 - 0.5, 2)/0.08);
  
            var exposureMeasure = gaussIntensityRed*gaussIntensityGreen*gaussIntensityBlue;
            
            weight *= Math.pow(exposureMeasure, exposureExponent);
          }

          weightMap.setPixelData(x, y, [weight + 1e-10]);
        }
      }
      
      return weightMap;
    }

    function reconstructLaplacianPyramid(pyramid)
    {
      var result = pyramid[pyramid.length - 1];
      for (var l = pyramid.length - 2; l >= 0; l--)
      {
        var currentArray = pyramid[l];
        
        var oddX = 2*result.width - currentArray.width;
        var oddY = 2*result.height - currentArray.height;
        
        result = currentArray.add(result.getUpsampledArray(oddX, oddY));
      }
      
      return result;
    }

    
    // Convert images to RGB arrays, create weight maps
    var imageRgbArrays = [];
    var imageWeightMaps = [];
    for (var i = 0; i < images.length; i++)
    {
      var imageRgbArray = imageToRgb(images[i]);
      
      imageRgbArrays.push(imageRgbArray);
      imageWeightMaps.push(createWeightMap(imageRgbArray, 1, 1, 1));
    }
    
    // Normalise weight maps
    var numberOfWeightMaps = imageWeightMaps.length;
    for (var y = 0; y < images[0].height; y++)
    {
      for (var x = 0; x < images[0].width; x++)
      {
        var weightMapPixelTotal = 0;
        for (var i = 0; i < numberOfWeightMaps; i++)
        {
          weightMapPixelTotal += imageWeightMaps[i].getPixelData(x, y)[0];
        }
        
        for (var i = 0; i < numberOfWeightMaps; i++)
        {
          imageWeightMaps[i].setPixelData(x, y, [imageWeightMaps[i].getPixelData(x, y)[0]/weightMapPixelTotal]);
        }
      }
    }
    
    // Perform pyramid blending
    var numberOfLevels = Math.floor(Math.log(Math.min(images[0].width, images[0].height))/Math.log(2));
    var blendedPyramid = new PixelArray(images[0].width, images[0].height, 3).getGaussianPyramid(numberOfLevels);
    
    for (var i = 0; i < images.length; i++)
    {
      var weightMapGaussianPyramid = imageWeightMaps[i].getGaussianPyramid(numberOfLevels);
      var imageLaplacianPyramid = imageRgbArrays[i].getLaplacianPyramid(numberOfLevels);
      
      for (var l = 0; l < numberOfLevels; l++)
      {
        blendedPyramid[l] = blendedPyramid[l].add(imageLaplacianPyramid[l].multiply(weightMapGaussianPyramid[l]));
      }
    }
    
    // Reconstruct image
    var resultRgb = reconstructLaplacianPyramid(blendedPyramid);
    
    // Convert result to usable format
    var resultCanvas = document.createElement("canvas");
    resultCanvas.width = resultRgb.width;
    resultCanvas.height = resultRgb.height;

    var resultContext = resultCanvas.getContext("2d");
    var resultImageData = resultContext.getImageData(0, 0, resultCanvas.width, resultCanvas.height);
    var resultData = resultImageData.data;
    
    for (var y = 0; y < resultRgb.height; y++)
    {
      for (var x = 0; x < resultRgb.width; x++)
      {
        var resultPixelData = resultRgb.getPixelData(x, y);
        var dataIndex = (y*resultRgb.width + x)*4;
        
        resultData[dataIndex] = resultPixelData[0];
        resultData[dataIndex + 1] = resultPixelData[1];
        resultData[dataIndex + 2] = resultPixelData[2];
        resultData[dataIndex + 3] = 255;
      }
    }
    
    resultContext.putImageData(resultImageData, 0, 0);
    
    var resultImage = new Image();
    resultImage.src = resultCanvas.toDataURL("image/png");
    
    return resultImage;
  }
};