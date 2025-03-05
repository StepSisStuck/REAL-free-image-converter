const fileInput = document.getElementById('fileInput');
const outputFormatSelect = document.getElementById('outputFormat');
const qualityContainer = document.getElementById('qualityContainer');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValueSpan = document.getElementById('qualityValue');
const convertButton = document.getElementById('convertButton');
const conversionResults = document.getElementById('conversionResults');
const downloadLink = document.getElementById('downloadLink');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Update quality label when slider changes
qualitySlider.addEventListener('input', () => {
  qualityValueSpan.textContent = qualitySlider.value;
});

// Show/hide the quality slider based on output format selection
outputFormatSelect.addEventListener('change', () => {
  const selectedFormat = outputFormatSelect.value;
  qualityContainer.style.display =
    (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp') ? 'block' : 'none';
});

// Enable convert button when files are selected and clear previous results
fileInput.addEventListener('change', () => {
  convertButton.disabled = fileInput.files.length === 0;
  conversionResults.innerHTML = '';
  downloadLink.style.display = 'none';
  downloadLink.href = '';
  downloadLink.textContent = 'Download Converted File';
});

// Helper: get file extension from filename
function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

// Convert native formats (PNG, JPEG, WEBP, GIF, BMP, SVG) using an Image element
function convertNativeImage(file, selectedFormat, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        let dataURL =
          (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp')
            ? canvas.toDataURL(selectedFormat, quality)
            : canvas.toDataURL(selectedFormat);
        resolve({ dataURL, width: img.width, height: img.height, pageNumber: 1 });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Convert TIFF using UTIF.js
function convertTIFF(file, selectedFormat, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      const ifds = UTIF.decode(buffer);
      UTIF.decodeImages(buffer, ifds);
      const first = ifds[0];
      const rgba = UTIF.toRGBA8(first);
      canvas.width = first.width;
      canvas.height = first.height;
      const imageData = ctx.createImageData(first.width, first.height);
      imageData.data.set(rgba);
      ctx.putImageData(imageData, 0, 0);
      let dataURL =
        (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp')
          ? canvas.toDataURL(selectedFormat, quality)
          : canvas.toDataURL(selectedFormat);
      resolve({ dataURL, width: first.width, height: first.height, pageNumber: 1 });
    };
    reader.readAsArrayBuffer(file);
  });
}

// Convert PSD using psd.js (outputs a PNG data URL)
function convertPSD(file, selectedFormat, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      PSD.fromArrayBuffer(buffer)
        .then(psd => psd.image.toPng())
        .then(pngDataURL => {
          const img = new Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            let dataURL =
              (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp')
                ? canvas.toDataURL(selectedFormat, quality)
                : canvas.toDataURL(selectedFormat);
            resolve({ dataURL, width: img.width, height: img.height, pageNumber: 1 });
          };
          img.src = pngDataURL;
        })
        .catch(reject);
    };
    reader.readAsArrayBuffer(file);
  });
}

// Convert ICO using icojs (choosing the largest available icon)
function convertICO(file, selectedFormat, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      icojs.parse(buffer)
        .then(images => {
          let chosen = images.reduce((prev, curr) => (curr.width > prev.width ? curr : prev), images[0]);
          const img = new Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            let dataURL =
              (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp')
                ? canvas.toDataURL(selectedFormat, quality)
                : canvas.toDataURL(selectedFormat);
            resolve({ dataURL, width: img.width, height: img.height, pageNumber: 1 });
          };
          img.src = chosen.src;
        })
        .catch(reject);
    };
    reader.readAsArrayBuffer(file);
  });
}

// Convert PDF using pdf.js by converting all pages.
function convertPDF(file, selectedFormat, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      loadingTask.promise.then(pdf => {
        let pagePromises = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          pagePromises.push(
            pdf.getPage(i).then(page => {
              const viewport = page.getViewport({ scale: 1 });
              const tempCanvas = document.createElement('canvas');
              const tempCtx = tempCanvas.getContext('2d');
              tempCanvas.width = viewport.width;
              tempCanvas.height = viewport.height;
              const renderContext = {
                canvasContext: tempCtx,
                viewport: viewport
              };
              return page.render(renderContext).promise.then(() => {
                let dataURL =
                  (selectedFormat === 'image/jpeg' || selectedFormat === 'image/webp')
                    ? tempCanvas.toDataURL(selectedFormat, quality)
                    : tempCanvas.toDataURL(selectedFormat);
                return { dataURL, width: viewport.width, height: viewport.height, pageNumber: i };
              });
            })
          );
        }
        Promise.all(pagePromises).then(results => resolve(results)).catch(reject);
      }).catch(reject);
    };
    reader.readAsArrayBuffer(file);
  });
}

// General conversion function: returns an array of conversion results.
async function convertFile(file, selectedFormat, quality) {
  const ext = getFileExtension(file.name);
  let results = [];
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) {
    const res = await convertNativeImage(file, selectedFormat, quality);
    results.push(res);
  } else if (['tiff', 'tif'].includes(ext)) {
    const res = await convertTIFF(file, selectedFormat, quality);
    results.push(res);
  } else if (ext === 'psd') {
    const res = await convertPSD(file, selectedFormat, quality);
    results.push(res);
  } else if (ext === 'ico') {
    const res = await convertICO(file, selectedFormat, quality);
    results.push(res);
  } else if (ext === 'pdf') {
    results = await convertPDF(file, selectedFormat, quality);
  } else {
    throw new Error('Unsupported file format: ' + ext);
  }
  return results;
}

// Handle conversion when the Convert button is clicked.
convertButton.addEventListener('click', async () => {
  conversionResults.innerHTML = '';
  downloadLink.style.display = 'none';
  downloadLink.href = '';

  const files = fileInput.files;
  const selectedFormat = outputFormatSelect.value;
  const quality = parseFloat(qualitySlider.value);

  if (files.length === 1) {
    try {
      const file = files[0];
      const results = await convertFile(file, selectedFormat, quality);
      
      let newExtension = '';
      if (selectedFormat === 'image/jpeg') newExtension = '.jpeg';
      else if (selectedFormat === 'image/png') newExtension = '.png';
      else if (selectedFormat === 'image/webp') newExtension = '.webp';
      
      let originalName = file.name;
      let baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
      
      if (results.length === 1) {
        let newFileName = baseName + newExtension;
        const resultDiv = document.createElement('div');
        resultDiv.className = 'result-item';
        const previewImg = document.createElement('img');
        previewImg.src = results[0].dataURL;
        previewImg.alt = newFileName;
        const fileNameText = document.createElement('p');
        fileNameText.textContent = newFileName;
        resultDiv.appendChild(previewImg);
        resultDiv.appendChild(fileNameText);
        conversionResults.appendChild(resultDiv);
        
        downloadLink.href = results[0].dataURL;
        downloadLink.download = newFileName;
        downloadLink.style.display = 'inline';
        downloadLink.textContent = 'Download ' + newFileName;
      } else {
        // Multiple images (e.g. multi-page PDF) --> ZIP them.
        let zip = new JSZip();
        results.forEach(item => {
          let newFileName = baseName + '_page' + item.pageNumber + newExtension;
          const base64Data = item.dataURL.split(',')[1];
          zip.file(newFileName, base64Data, { base64: true });
          const resultDiv = document.createElement('div');
          resultDiv.className = 'result-item';
          const previewImg = document.createElement('img');
          previewImg.src = item.dataURL;
          previewImg.alt = newFileName;
          const fileNameText = document.createElement('p');
          fileNameText.textContent = newFileName;
          resultDiv.appendChild(previewImg);
          resultDiv.appendChild(fileNameText);
          conversionResults.appendChild(resultDiv);
        });
        zip.generateAsync({ type: 'blob' }).then(content => {
          const zipUrl = URL.createObjectURL(content);
          downloadLink.href = zipUrl;
          downloadLink.download = baseName + '_converted.zip';
          downloadLink.style.display = 'inline';
          downloadLink.textContent = 'Download ZIP of Converted Pages';
        });
      }
    } catch (error) {
      alert('Error converting file: ' + error.message);
    }
  } else if (files.length > 1) {
    let zip = new JSZip();
    let conversionPromises = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let promise = convertFile(file, selectedFormat, quality)
        .then(results => {
          let newExtension = '';
          if (selectedFormat === 'image/jpeg') newExtension = '.jpeg';
          else if (selectedFormat === 'image/png') newExtension = '.png';
          else if (selectedFormat === 'image/webp') newExtension = '.webp';
          
          let originalName = file.name;
          let baseName = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
          
          if (results.length === 1) {
            let newFileName = baseName + newExtension;
            const base64Data = results[0].dataURL.split(',')[1];
            zip.file(newFileName, base64Data, { base64: true });
            const resultDiv = document.createElement('div');
            resultDiv.className = 'result-item';
            const previewImg = document.createElement('img');
            previewImg.src = results[0].dataURL;
            previewImg.alt = newFileName;
            const fileNameText = document.createElement('p');
            fileNameText.textContent = newFileName;
            resultDiv.appendChild(previewImg);
            resultDiv.appendChild(fileNameText);
            conversionResults.appendChild(resultDiv);
          } else {
            results.forEach(item => {
              let newFileName = baseName + '_page' + item.pageNumber + newExtension;
              const base64Data = item.dataURL.split(',')[1];
              zip.file(newFileName, base64Data, { base64: true });
              const resultDiv = document.createElement('div');
              resultDiv.className = 'result-item';
              const previewImg = document.createElement('img');
              previewImg.src = item.dataURL;
              previewImg.alt = newFileName;
              const fileNameText = document.createElement('p');
              fileNameText.textContent = newFileName;
              resultDiv.appendChild(previewImg);
              resultDiv.appendChild(fileNameText);
              conversionResults.appendChild(resultDiv);
            });
          }
        })
        .catch(error => {
          alert('Error converting file ' + file.name + ': ' + error.message);
        });
      conversionPromises.push(promise);
    }
    await Promise.all(conversionPromises);
    zip.generateAsync({ type: 'blob' }).then(content => {
      const zipUrl = URL.createObjectURL(content);
      downloadLink.href = zipUrl;
      downloadLink.download = 'converted_images.zip';
      downloadLink.style.display = 'inline';
      downloadLink.textContent = 'Download ZIP of Converted Images';
    });
  }
});
